#!/usr/bin/env bash
# Восстановление PostgreSQL из дампа (откат)
#
# Использование:
#   ./restore.sh <путь_к_dump_файлу>
#   ./restore.sh --latest                   # последний daily дамп
#   ./restore.sh --list                     # показать доступные дампы
#
# ВНИМАНИЕ: Восстановление затирает текущую БД!
# Перед запуском убедитесь, что приложение остановлено.
#
# Переменные окружения:
#   POSTGRES_PASSWORD   — пароль PostgreSQL
#   BACKUP_DIR          — каталог бэкапов (default: /var/backups/jtd)
#   DB_CONTAINER        — имя контейнера БД

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
DB_CONTAINER="${DB_CONTAINER:-self-hosting-db-1}"

# ---------- Обработка аргументов ----------
if [ $# -eq 0 ]; then
  echo "Использование: $0 <dump_file|--latest|--list>"
  exit 1
fi

case "$1" in
  --list)
    echo "=== Доступные дампы ==="
    echo ""
    echo "Daily (последние 7):"
    ls -lht "${BACKUP_DIR}/daily/"*.dump 2>/dev/null | head -7 || echo "  Нет дампов"
    echo ""
    echo "Weekly:"
    ls -lht "${BACKUP_DIR}/weekly/"*.dump 2>/dev/null || echo "  Нет дампов"
    echo ""
    echo "Monthly:"
    ls -lht "${BACKUP_DIR}/monthly/"*.dump 2>/dev/null || echo "  Нет дампов"
    exit 0
    ;;
  --latest)
    DUMP_FILE=$(cat "${BACKUP_DIR}/last_backup_file" 2>/dev/null || \
      ls -t "${BACKUP_DIR}/daily/"*.dump 2>/dev/null | head -1)
    if [ -z "${DUMP_FILE:-}" ]; then
      echo "ОШИБКА: Нет дампов в ${BACKUP_DIR}/daily/"
      exit 1
    fi
    ;;
  *)
    DUMP_FILE="$1"
    ;;
esac

if [ ! -f "${DUMP_FILE}" ]; then
  echo "ОШИБКА: Файл не найден: ${DUMP_FILE}"
  exit 1
fi

DUMP_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)

echo "=========================================="
echo " JTD Database Restore"
echo "=========================================="
echo " Файл:      ${DUMP_FILE}"
echo " Размер:    ${DUMP_SIZE}"
echo " Контейнер: ${DB_CONTAINER}"
echo " Время:     $(date)"
echo "=========================================="
echo ""
echo "ВНИМАНИЕ: Эта операция ПОЛНОСТЬЮ ЗАМЕНИТ текущую базу данных!"
echo ""
read -r -p "Введите 'ВОССТАНОВИТЬ' для подтверждения: " CONFIRM

if [ "${CONFIRM}" != "ВОССТАНОВИТЬ" ]; then
  echo "Отменено."
  exit 0
fi

echo ""
echo "[1/4] Проверка дампа перед восстановлением..."
docker exec "${DB_CONTAINER}" pg_restore --list /dev/stdin < "${DUMP_FILE}" > /dev/null
echo "  OK: дамп валиден"

echo "[2/4] Создание аварийного бэкапа текущей БД..."
EMERGENCY_DUMP="${BACKUP_DIR}/daily/emergency_before_restore_$(date +%Y%m%d_%H%M%S).dump"
docker exec "${DB_CONTAINER}" \
  pg_dump -U postgres -Fc --no-acl postgres \
  > "${EMERGENCY_DUMP}"
echo "  OK: ${EMERGENCY_DUMP}"

echo "[3/4] Остановка соединений и пересоздание БД..."
docker exec "${DB_CONTAINER}" psql -U postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'postgres' AND pid <> pg_backend_pid();
" > /dev/null

docker exec "${DB_CONTAINER}" psql -U postgres -c "DROP DATABASE IF EXISTS postgres_restore_tmp;" > /dev/null 2>&1 || true
docker exec "${DB_CONTAINER}" psql -U postgres -c "CREATE DATABASE postgres_restore_tmp;" > /dev/null

echo "[4/4] Восстановление данных..."
# Восстанавливаем во временную БД сначала для безопасности
docker exec "${DB_CONTAINER}" pg_restore \
  -U postgres \
  -d postgres_restore_tmp \
  --no-acl --no-owner \
  --exit-on-error \
  /dev/stdin < "${DUMP_FILE}"

# Если успешно — переключаем
docker exec "${DB_CONTAINER}" psql -U postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = 'postgres' AND pid <> pg_backend_pid();
" > /dev/null

docker exec "${DB_CONTAINER}" psql -U postgres -c "DROP DATABASE postgres;" > /dev/null
docker exec "${DB_CONTAINER}" psql -U postgres -c "ALTER DATABASE postgres_restore_tmp RENAME TO postgres;" > /dev/null

echo ""
echo "=========================================="
echo " Восстановление завершено успешно!"
echo " Аварийный бэкап сохранён: ${EMERGENCY_DUMP}"
echo "=========================================="
echo ""
echo "Запустите приложение: docker compose up -d"
