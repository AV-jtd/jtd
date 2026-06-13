#!/usr/bin/env bash
# Миграция файлов из локального Storage (file-бэкенд) в S3.
#
# Использование:
#   ./migrate-to-s3.sh [--dry-run] [--source <path>]
#
# Переменные окружения (из .env.supabase):
#   STORAGE_S3_ENDPOINT     — URL S3-совместимого хранилища
#   STORAGE_S3_BUCKET       — имя бакета
#   STORAGE_S3_REGION       — регион (default: ru-1)
#   STORAGE_S3_KEY_ID       — AWS_ACCESS_KEY_ID
#   STORAGE_S3_SECRET       — AWS_SECRET_ACCESS_KEY
#   STORAGE_DATA_DIR        — путь к файлам (default: /var/lib/jtd-storage)
#
# Предусловия:
#   - Установлен aws CLI (pip install awscli или apt install awscli)
#   - Бакет уже создан в S3
#   - Приложение можно оставить запущенным: s3 sync не удаляет источник

set -euo pipefail

DRY_RUN=false
SOURCE_DIR="${STORAGE_DATA_DIR:-/var/lib/jtd-storage}"

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --source)  SOURCE_DIR="$2"; shift ;;
  esac
done

# ---------- Проверка переменных ----------
MISSING=()
for VAR in STORAGE_S3_ENDPOINT STORAGE_S3_BUCKET STORAGE_S3_KEY_ID STORAGE_S3_SECRET; do
  [ -z "${!VAR:-}" ] && MISSING+=("$VAR")
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ОШИБКА: Не заданы переменные: ${MISSING[*]}"
  echo ""
  echo "Экспортируй их или загрузи из .env.supabase:"
  echo "  export \$(grep -v '^#' self-hosting/.env.supabase | xargs)"
  exit 1
fi

# ---------- Проверка aws CLI ----------
if ! command -v aws &>/dev/null; then
  echo "ОШИБКА: aws CLI не найден."
  echo "Установка: pip install awscli  или  apt install awscli"
  exit 1
fi

export AWS_ACCESS_KEY_ID="${STORAGE_S3_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${STORAGE_S3_SECRET}"
S3_REGION="${STORAGE_S3_REGION:-ru-1}"
S3_ENDPOINT="${STORAGE_S3_ENDPOINT}"
S3_BUCKET="${STORAGE_S3_BUCKET}"

echo "=========================================="
echo " JTD Storage Migration: file → S3"
echo "=========================================="
echo " Источник:  ${SOURCE_DIR}"
echo " S3:        s3://${S3_BUCKET} (${S3_ENDPOINT})"
echo " Dry-run:   ${DRY_RUN}"
echo "=========================================="

# ---------- Проверка доступа к бакету ----------
echo ""
echo "[1/4] Проверка доступа к S3..."
aws s3 ls "s3://${S3_BUCKET}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region "${S3_REGION}" > /dev/null
echo "  OK: бакет доступен"

# ---------- Подсчёт файлов ----------
echo ""
echo "[2/4] Анализ источника..."
if [ ! -d "${SOURCE_DIR}" ]; then
  echo "  WARN: ${SOURCE_DIR} не найден — нечего мигрировать"
  exit 0
fi

FILE_COUNT=$(find "${SOURCE_DIR}" -type f | wc -l)
TOTAL_SIZE=$(du -sh "${SOURCE_DIR}" | cut -f1)
echo "  Файлов: ${FILE_COUNT}, Размер: ${TOTAL_SIZE}"

# ---------- Синхронизация ----------
echo ""
echo "[3/4] Синхронизация в S3..."

SYNC_ARGS=(
  s3 sync "${SOURCE_DIR}" "s3://${S3_BUCKET}/storage/"
  --endpoint-url "${S3_ENDPOINT}"
  --region "${S3_REGION}"
  --no-progress
  --exclude "*.tmp"
)

if [ "$DRY_RUN" = "true" ]; then
  SYNC_ARGS+=(--dryrun)
  echo "  (dry-run — реальной загрузки нет)"
fi

aws "${SYNC_ARGS[@]}"
echo "  OK: синхронизация завершена"

# ---------- Верификация ----------
echo ""
echo "[4/4] Верификация: сравнение количества объектов..."

LOCAL_COUNT=$(find "${SOURCE_DIR}" -type f | wc -l)
S3_COUNT=$(aws s3 ls "s3://${S3_BUCKET}/storage/" \
  --endpoint-url "${S3_ENDPOINT}" \
  --region "${S3_REGION}" \
  --recursive | wc -l)

if [ "$DRY_RUN" = "true" ]; then
  echo "  SKIP: dry-run, верификация не выполняется"
else
  echo "  Локальных файлов: ${LOCAL_COUNT}"
  echo "  Объектов в S3:    ${S3_COUNT}"

  if [ "${LOCAL_COUNT}" -le "${S3_COUNT}" ]; then
    echo "  OK: все файлы перенесены"
  else
    echo "  WARN: S3 объектов меньше чем локальных файлов (${S3_COUNT} < ${LOCAL_COUNT})"
    echo "  Возможно часть файлов не загрузилась — повтори миграцию"
    exit 1
  fi
fi

echo ""
echo "=========================================="
echo " Миграция завершена!"
echo "=========================================="
echo ""
echo "Следующие шаги:"
echo "1. Убедись что S3-файлы доступны через Supabase Storage API"
echo "2. Обнови .env.supabase: STORAGE_BACKEND=s3 и STORAGE_S3_* переменные"
echo "3. Перезапусти storage-контейнер:"
echo "   docker compose -f self-hosting/docker-compose.supabase.yml restart storage"
echo "4. Проверь: ./self-hosting/storage/test-s3.sh"
echo ""
echo "Локальные файлы НЕ удалены — они остаются для возможного отката."
echo "Удали их вручную после подтверждения работы S3:"
echo "  rm -rf ${SOURCE_DIR}/*"
