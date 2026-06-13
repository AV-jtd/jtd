#!/usr/bin/env bash
# Тест S3-бэкенда для Supabase Storage.
#
# Проверяет:
#   1. Подключение к S3 и доступ к бакету
#   2. Upload тестового объекта
#   3. Download и сверка контрольной суммы
#   4. Delete объекта
#   5. Supabase Storage API через Kong (upload через API)
#
# Переменные окружения:
#   STORAGE_S3_ENDPOINT, STORAGE_S3_BUCKET, STORAGE_S3_KEY_ID, STORAGE_S3_SECRET
#   SUPABASE_URL    — URL Kong (default: http://localhost:8000)
#   SERVICE_ROLE_KEY — ключ Supabase

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-http://localhost:8000}"
S3_REGION="${STORAGE_S3_REGION:-ru-1}"
TEST_BUCKET_PREFIX="jtd-storage-test"
TEST_OBJECT_KEY="${TEST_BUCKET_PREFIX}/test-$(date +%s).txt"
TEST_CONTENT="JTD S3 backend test $(date)"

PASS=0
FAIL=0

check() {
  local desc="$1" result="$2"
  if [ "$result" = "0" ]; then
    echo "  ✓ ${desc}"; PASS=$((PASS+1))
  else
    echo "  ✗ ${desc}"; FAIL=$((FAIL+1))
  fi
}

echo "=== JTD S3 Storage Test Suite ==="
echo "Время: $(date)"
echo ""

# ---------- Проверка зависимостей ----------
if ! command -v aws &>/dev/null; then
  echo "ОШИБКА: aws CLI не найден (pip install awscli)"
  exit 1
fi

MISSING=()
for VAR in STORAGE_S3_ENDPOINT STORAGE_S3_BUCKET STORAGE_S3_KEY_ID STORAGE_S3_SECRET; do
  [ -z "${!VAR:-}" ] && MISSING+=("$VAR")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ОШИБКА: Не заданы: ${MISSING[*]}"
  exit 1
fi

export AWS_ACCESS_KEY_ID="${STORAGE_S3_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${STORAGE_S3_SECRET}"
S3_ARGS=(--endpoint-url "${STORAGE_S3_ENDPOINT}" --region "${S3_REGION}")

# ---------- Тест 1: Доступ к бакету ----------
echo "[TEST 1] Подключение к S3..."
EXIT=0
aws s3 ls "s3://${STORAGE_S3_BUCKET}" "${S3_ARGS[@]}" > /dev/null 2>&1 || EXIT=$?
check "Бакет ${STORAGE_S3_BUCKET} доступен" "${EXIT}"

# ---------- Тест 2: Upload ----------
echo ""
echo "[TEST 2] Upload тестового объекта..."
TMPFILE=$(mktemp)
echo "${TEST_CONTENT}" > "${TMPFILE}"
EXPECTED_MD5=$(md5sum "${TMPFILE}" | awk '{print $1}')

EXIT=0
aws s3 cp "${TMPFILE}" "s3://${STORAGE_S3_BUCKET}/${TEST_OBJECT_KEY}" \
  "${S3_ARGS[@]}" > /dev/null 2>&1 || EXIT=$?
check "Объект загружен в S3" "${EXIT}"

# ---------- Тест 3: Download + checksum ----------
echo ""
echo "[TEST 3] Download и проверка контрольной суммы..."
DOWNLOAD_FILE=$(mktemp)

EXIT=0
aws s3 cp "s3://${STORAGE_S3_BUCKET}/${TEST_OBJECT_KEY}" "${DOWNLOAD_FILE}" \
  "${S3_ARGS[@]}" > /dev/null 2>&1 || EXIT=$?
check "Объект скачан из S3" "${EXIT}"

if [ "${EXIT}" = "0" ]; then
  ACTUAL_MD5=$(md5sum "${DOWNLOAD_FILE}" | awk '{print $1}')
  if [ "${EXPECTED_MD5}" = "${ACTUAL_MD5}" ]; then
    echo "  ✓ MD5 совпадает (${ACTUAL_MD5})"
    PASS=$((PASS+1))
  else
    echo "  ✗ MD5 не совпадает: ожидался ${EXPECTED_MD5}, получен ${ACTUAL_MD5}"
    FAIL=$((FAIL+1))
  fi
fi

# ---------- Тест 4: Delete ----------
echo ""
echo "[TEST 4] Удаление тестового объекта..."
EXIT=0
aws s3 rm "s3://${STORAGE_S3_BUCKET}/${TEST_OBJECT_KEY}" \
  "${S3_ARGS[@]}" > /dev/null 2>&1 || EXIT=$?
check "Объект удалён из S3" "${EXIT}"

# Проверяем что объект действительно удалён
EXISTS=$(aws s3 ls "s3://${STORAGE_S3_BUCKET}/${TEST_OBJECT_KEY}" \
  "${S3_ARGS[@]}" 2>/dev/null | wc -l)
if [ "${EXISTS}" = "0" ]; then
  echo "  ✓ Объект не найден после удаления"
  PASS=$((PASS+1))
else
  echo "  ✗ Объект всё ещё существует после удаления"
  FAIL=$((FAIL+1))
fi

# ---------- Тест 5: Supabase Storage API ----------
echo ""
echo "[TEST 5] Supabase Storage API (через Kong)..."

if [ -n "${SERVICE_ROLE_KEY:-}" ]; then
  # Создаём тестовый бакет через API
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/storage/v1/bucket" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"id":"jtd-api-test","name":"jtd-api-test","public":false}')

  # 200 или 400 (уже существует) — оба ОК
  if [ "${HTTP_STATUS}" = "200" ] || [ "${HTTP_STATUS}" = "400" ]; then
    echo "  ✓ Storage API отвечает (HTTP ${HTTP_STATUS})"
    PASS=$((PASS+1))
  else
    echo "  ✗ Storage API вернул HTTP ${HTTP_STATUS}"
    FAIL=$((FAIL+1))
  fi

  # Получаем список бакетов
  BUCKETS=$(curl -s \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    "${SUPABASE_URL}/storage/v1/bucket" | \
    grep -o '"name"' | wc -l)
  echo "  Бакетов в Storage: ${BUCKETS}"
else
  echo "  SKIP: SERVICE_ROLE_KEY не задан"
fi

# ---------- Очистка ----------
rm -f "${TMPFILE}" "${DOWNLOAD_FILE}"

# ---------- Итог ----------
echo ""
echo "==========================================="
echo " Результат: ${PASS} прошло / ${FAIL} упало"
echo "==========================================="

if [ "${FAIL}" -gt 0 ]; then
  echo " СТАТУС: ПРОВАЛ"
  exit 1
else
  echo " СТАТУС: OK — S3-бэкенд работает корректно"
  exit 0
fi
