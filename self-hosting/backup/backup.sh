#!/usr/bin/env bash
# Бэкап PostgreSQL + Storage для JTD self-hosted
# Использование: ./backup.sh [--storage] [--verify] [--s3]
#
# Переменные окружения (из .env.supabase или экспортированные):
#   POSTGRES_PASSWORD   — пароль PostgreSQL
#   BACKUP_DIR          — куда сохранять (default: /var/backups/jtd)
#   BACKUP_KEEP_DAYS    — хранить ежедневные (default: 7)
#   BACKUP_KEEP_WEEKS   — хранить еженедельные (default: 4)
#   BACKUP_KEEP_MONTHS  — хранить ежемесячные (default: 6)
#   S3_ENDPOINT         — URL S3-совместимого хранилища (опционально)
#   S3_BUCKET           — имя бакета
#   AWS_ACCESS_KEY_ID   — ключ S3
#   AWS_SECRET_ACCESS_KEY — секрет S3
#   STORAGE_DATA_DIR    — путь к файлам Storage (default: /var/lib/jtd-storage)
#   COMPOSE_PROJECT     — имя docker compose проекта (default: self-hosting)

set -euo pipefail

# ---------- Настройки по умолчанию ----------
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
BACKUP_KEEP_WEEKS="${BACKUP_KEEP_WEEKS:-4}"
BACKUP_KEEP_MONTHS="${BACKUP_KEEP_MONTHS:-6}"
STORAGE_DATA_DIR="${STORAGE_DATA_DIR:-/var/lib/jtd-storage}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-self-hosting}"
DB_CONTAINER="${DB_CONTAINER:-${COMPOSE_PROJECT}-db-1}"
# ВАЖНО: pg_dump, встроенный в образ supabase/postgres:15.8.1.060 (внутри
# DB_CONTAINER), стабильно падает с segfault (проверено 2026-07-07, 3/3
# попыток, dmesg подтверждает crash в самом бинарнике). Используем pg_dump
# из контейнера pg-backup (postgres:15-alpine, pg_dump 15.18) — он уже
# работает каждый день по крону и подключается по сети через -h db.
PGDUMP_CONTAINER="${PGDUMP_CONTAINER:-${COMPOSE_PROJECT}-pg-backup-1}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DOW=$(date +%u)   # 1=пн … 7=вс
DOM=$(date +%d)   # день месяца

DO_STORAGE=false
DO_VERIFY=false
DO_S3=false

for arg in "$@"; do
  case $arg in
    --storage) DO_STORAGE=true ;;
    --verify)  DO_VERIFY=true ;;
    --s3)      DO_S3=true ;;
  esac
done

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly" "${BACKUP_DIR}/logs"

LOG="${BACKUP_DIR}/logs/backup_${TIMESTAMP}.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== JTD Backup started at $(date) ==="

# ---------- 1. PostgreSQL dump ----------
echo "[1/4] PostgreSQL dump..."

DUMP_FILE="${BACKUP_DIR}/daily/db_${TIMESTAMP}.dump"

PGPASSWORD="${POSTGRES_PASSWORD}" docker exec -e PGPASSWORD "${PGDUMP_CONTAINER}" \
  pg_dump -h db -U postgres -Fc --no-acl postgres \
  > "${DUMP_FILE}"

DUMP_SIZE=$(du -sh "${DUMP_FILE}" | cut -f1)
echo "  OK: ${DUMP_FILE} (${DUMP_SIZE})"

# ---------- 2. Верификация дампа ----------
if [ "$DO_VERIFY" = "true" ]; then
  echo "[2/4] Верификация дампа..."
  docker exec -i "${PGDUMP_CONTAINER}" \
    pg_restore --list < "${DUMP_FILE}" > /dev/null
  echo "  OK: дамп валиден"
else
  echo "[2/4] Верификация пропущена (передайте --verify для проверки)"
fi

# ---------- 3. Бэкап Storage (файлы вложений) ----------
if [ "$DO_STORAGE" = "true" ]; then
  echo "[3/4] Архивирование Storage..."
  if [ -d "${STORAGE_DATA_DIR}" ]; then
    STORAGE_ARCHIVE="${BACKUP_DIR}/daily/storage_${TIMESTAMP}.tar.gz"
    tar -czf "${STORAGE_ARCHIVE}" -C "${STORAGE_DATA_DIR}" .
    STORAGE_SIZE=$(du -sh "${STORAGE_ARCHIVE}" | cut -f1)
    echo "  OK: ${STORAGE_ARCHIVE} (${STORAGE_SIZE})"
  else
    echo "  SKIP: ${STORAGE_DATA_DIR} не найден"
  fi
else
  echo "[3/4] Бэкап Storage пропущен (передайте --storage для включения)"
fi

# ---------- 4. Ротация: weekly / monthly копии ----------
echo "[4/4] Ротация бэкапов..."

# Еженедельный (по воскресеньям)
if [ "$DOW" = "7" ]; then
  cp "${DUMP_FILE}" "${BACKUP_DIR}/weekly/db_week$(date +%V_%Y).dump"
  echo "  Создана еженедельная копия"
fi

# Ежемесячный (1-го числа)
if [ "$DOM" = "01" ]; then
  cp "${DUMP_FILE}" "${BACKUP_DIR}/monthly/db_$(date +%Y%m).dump"
  echo "  Создана ежемесячная копия"
fi

# Удалить старые daily (старше BACKUP_KEEP_DAYS дней)
find "${BACKUP_DIR}/daily" -name "*.dump" -mtime "+${BACKUP_KEEP_DAYS}" -delete
find "${BACKUP_DIR}/daily" -name "*.tar.gz" -mtime "+${BACKUP_KEEP_DAYS}" -delete

# Удалить старые weekly (старше BACKUP_KEEP_WEEKS недель)
find "${BACKUP_DIR}/weekly" -name "*.dump" \
  -mtime "+$(( BACKUP_KEEP_WEEKS * 7 ))" -delete

# Удалить старые monthly (старше BACKUP_KEEP_MONTHS месяцев)
find "${BACKUP_DIR}/monthly" -name "*.dump" \
  -mtime "+$(( BACKUP_KEEP_MONTHS * 30 ))" -delete

echo "  Ротация завершена"

# ---------- 5. Выгрузка в S3 (опционально) ----------
if [ "$DO_S3" = "true" ]; then
  echo "[5/5] Выгрузка в S3..."
  if command -v aws &>/dev/null; then
    S3_KEY="backups/$(hostname)/db_${TIMESTAMP}.dump"
    aws s3 cp "${DUMP_FILE}" "s3://${S3_BUCKET}/${S3_KEY}" \
      ${S3_ENDPOINT:+--endpoint-url "${S3_ENDPOINT}"}
    echo "  OK: s3://${S3_BUCKET}/${S3_KEY}"
  else
    echo "  WARN: aws CLI не найден, S3 выгрузка пропущена"
  fi
fi

# ---------- Итог ----------
echo ""
echo "=== Backup завершён успешно: $(date) ==="
echo "Файл: ${DUMP_FILE}"
echo "Лог:  ${LOG}"

# Записать метаданные последнего бэкапа для мониторинга
echo "${TIMESTAMP}" > "${BACKUP_DIR}/last_backup_timestamp"
echo "${DUMP_FILE}" > "${BACKUP_DIR}/last_backup_file"
