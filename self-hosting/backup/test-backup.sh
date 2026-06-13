#!/usr/bin/env bash
# Тест бэкапа: полный цикл backup → restore → verify в изолированном контейнере
#
# Использование: ./test-backup.sh [--dump <file>]
#
# Что проверяет:
#   1. Дамп создаётся без ошибок
#   2. Дамп содержит все ключевые таблицы
#   3. Дамп восстанавливается в тестовую БД
#   4. Количество строк в ключевых таблицах совпадает

set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-self-hosting-db-1}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
TEST_DB="jtd_backup_test_$$"
DUMP_FILE=""

for i in "$@"; do
  case $i in
    --dump) DUMP_FILE="$2"; shift 2 ;;
  esac
done

PASS=0
FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo "  ✓ ${desc}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${desc}"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== JTD Backup Test Suite ==="
echo "Время: $(date)"
echo ""

# ---------- Тест 1: Создание дампа ----------
echo "[TEST 1] Создание нового дампа..."
TEMP_DUMP="/tmp/jtd_test_dump_$$.dump"
docker exec "${DB_CONTAINER}" \
  pg_dump -U postgres -Fc --no-acl postgres \
  > "${TEMP_DUMP}" 2>/dev/null
check "pg_dump завершился без ошибок" $?

DUMP_SIZE=$(stat -c%s "${TEMP_DUMP}" 2>/dev/null || stat -f%z "${TEMP_DUMP}")
if [ "${DUMP_SIZE}" -gt 10000 ]; then
  echo "  ✓ Размер дампа разумный ($(du -sh "${TEMP_DUMP}" | cut -f1))"
  PASS=$((PASS + 1))
else
  echo "  ✗ Дамп подозрительно мал (${DUMP_SIZE} байт)"
  FAIL=$((FAIL + 1))
fi

# Использовать переданный дамп или только что созданный
if [ -n "${DUMP_FILE}" ] && [ -f "${DUMP_FILE}" ]; then
  echo "  Используем переданный дамп: ${DUMP_FILE}"
  TEMP_DUMP="${DUMP_FILE}"
fi

# ---------- Тест 2: Содержимое дампа ----------
echo ""
echo "[TEST 2] Проверка содержимого дампа..."
TABLES_IN_DUMP=$(docker exec "${DB_CONTAINER}" \
  pg_restore --list /dev/stdin < "${TEMP_DUMP}" 2>/dev/null | \
  grep "TABLE DATA" | awk '{print $NF}')

for TABLE in tasks task_groups profiles task_comments; do
  if echo "${TABLES_IN_DUMP}" | grep -q "${TABLE}"; then
    echo "  ✓ Таблица ${TABLE} присутствует в дампе"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Таблица ${TABLE} НЕ найдена в дампе"
    FAIL=$((FAIL + 1))
  fi
done

# ---------- Тест 3: Восстановление в изолированную БД ----------
echo ""
echo "[TEST 3] Восстановление в тестовую БД '${TEST_DB}'..."

# Создаём тестовую БД
docker exec "${DB_CONTAINER}" \
  psql -U postgres -c "CREATE DATABASE ${TEST_DB};" > /dev/null 2>&1
check "Тестовая БД создана" $?

# Восстанавливаем
RESTORE_EXIT=0
docker exec "${DB_CONTAINER}" \
  pg_restore -U postgres -d "${TEST_DB}" \
  --no-acl --no-owner --exit-on-error \
  /dev/stdin < "${TEMP_DUMP}" > /dev/null 2>&1 || RESTORE_EXIT=$?
check "pg_restore завершился без ошибок" "${RESTORE_EXIT}"

# ---------- Тест 4: Верификация данных ----------
echo ""
echo "[TEST 4] Верификация данных в тестовой БД..."

verify_table_count() {
  local table="$1"
  local prod_count test_count
  prod_count=$(docker exec "${DB_CONTAINER}" \
    psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "-1")
  test_count=$(docker exec "${DB_CONTAINER}" \
    psql -U postgres -d "${TEST_DB}" -tAc "SELECT COUNT(*) FROM ${table};" 2>/dev/null || echo "-2")

  if [ "${prod_count}" = "${test_count}" ] && [ "${prod_count}" != "-1" ]; then
    echo "  ✓ ${table}: ${prod_count} строк совпадает"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${table}: prod=${prod_count}, test=${test_count}"
    FAIL=$((FAIL + 1))
  fi
}

if [ "${RESTORE_EXIT}" = "0" ]; then
  verify_table_count "tasks"
  verify_table_count "task_groups"
  verify_table_count "profiles"
else
  echo "  SKIP: Восстановление не удалось, пропускаем"
fi

# ---------- Тест 5: Ротация (dry-run) ----------
echo ""
echo "[TEST 5] Проверка структуры каталогов бэкапов..."

for DIR in daily weekly monthly logs; do
  if [ -d "${BACKUP_DIR}/${DIR}" ]; then
    echo "  ✓ ${BACKUP_DIR}/${DIR} существует"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${BACKUP_DIR}/${DIR} НЕ существует"
    FAIL=$((FAIL + 1))
  fi
done

# ---------- Очистка ----------
docker exec "${DB_CONTAINER}" \
  psql -U postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" > /dev/null 2>&1 || true

[ "${TEMP_DUMP}" != "${DUMP_FILE}" ] && rm -f "${TEMP_DUMP}"

# ---------- Итог ----------
echo ""
echo "==========================================="
echo " Результат: ${PASS} прошло / ${FAIL} упало"
echo "==========================================="

if [ "${FAIL}" -gt 0 ]; then
  echo " СТАТУС: ПРОВАЛ — бэкап ненадёжен!"
  exit 1
else
  echo " СТАТУС: OK — бэкап работает корректно"
  exit 0
fi
