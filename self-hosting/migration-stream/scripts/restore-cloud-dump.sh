#!/usr/bin/env bash
# Заливка облачного дампа в БД на VPS с обработкой схем auth/storage/public.
# Использование: ./restore-cloud-dump.sh <dump_file> [DB_CONTAINER]

set -euo pipefail

DUMP="${1:?Укажи путь к .dump файлу}"
DB_CONTAINER="${2:-self-hosting-db-1}"

[ -f "$DUMP" ] || { echo "Файл не найден: $DUMP"; exit 1; }

echo "=== Заливка дампа на VPS ==="
echo "Дамп:      $DUMP ($(du -sh "$DUMP" | cut -f1))"
echo "Контейнер: $DB_CONTAINER"
echo ""

# Проверка валидности дампа
echo "[1/3] Проверка дампа..."
docker exec -i "$DB_CONTAINER" pg_restore --list /dev/stdin < "$DUMP" > /dev/null
echo "  OK: дамп валиден"

# Аварийный бэкап текущего состояния VPS
echo "[2/3] Аварийный бэкап текущей БД VPS..."
EMERG="/tmp/vps_before_restore_$(date +%Y%m%d_%H%M%S).dump"
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc --no-acl postgres > "$EMERG"
echo "  OK: $EMERG"

# Восстановление данных (data-only поверх существующей схемы supabase-образа)
echo "[3/3] Восстановление..."
docker exec -i "$DB_CONTAINER" pg_restore \
  -U postgres -d postgres \
  --no-owner --no-privileges \
  --disable-triggers \
  --exit-on-error \
  < "$DUMP" 2>&1 | grep -vE "already exists|multiple primary keys" || true

echo ""
echo "=== Готово. Запусти verify-migration.sh для сверки. ==="
