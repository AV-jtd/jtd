#!/usr/bin/env bash
# Сверка целостности миграции: сравнение row counts между облаком и VPS.
#
# Использование:
#   ./verify-migration.sh "<CLOUD_DB_URL>" <NEW_DB_CONTAINER>
#
# Возвращает exit 0 если ВСЕ таблицы совпадают, иначе exit 1.

set -euo pipefail

CLOUD_DB="${1:?Укажи CLOUD_DB connection string первым аргументом}"
DB_CONTAINER="${2:-self-hosting-db-1}"

# Таблицы для сверки: schema.table
TABLES="
auth.users
public.profiles
public.tasks
public.task_groups
public.task_comments
public.subtasks
public.task_participants
public.task_dependencies
public.group_messages
public.group_members
public.clients
public.user_roles
public.user_departments
public.tags
public.kanban_boards
public.wiki_pages
storage.objects
storage.buckets
"

PASS=0
FAIL=0
FAILED_TABLES=""

echo "=== Сверка целостности миграции ==="
echo "Облако:   ${CLOUD_DB%%@*}@***"
echo "VPS:      ${DB_CONTAINER}"
echo "Время:    $(date)"
echo ""
printf "%-30s %12s %12s %8s\n" "ТАБЛИЦА" "ОБЛАКО" "VPS" "СТАТУС"
printf "%-30s %12s %12s %8s\n" "------" "------" "---" "------"

count_cloud() {
  psql "$CLOUD_DB" -tAc "SELECT COUNT(*) FROM $1;" 2>/dev/null || echo "ERR"
}

count_vps() {
  docker exec "$DB_CONTAINER" \
    psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM $1;" 2>/dev/null || echo "ERR"
}

for TABLE in $TABLES; do
  C=$(count_cloud "$TABLE")
  V=$(count_vps "$TABLE")

  if [ "$C" = "$V" ] && [ "$C" != "ERR" ]; then
    printf "%-30s %12s %12s %8s\n" "$TABLE" "$C" "$V" "OK"
    PASS=$((PASS+1))
  else
    printf "%-30s %12s %12s %8s\n" "$TABLE" "$C" "$V" "ПРОВАЛ"
    FAIL=$((FAIL+1))
    FAILED_TABLES="${FAILED_TABLES} ${TABLE}"
  fi
done

echo ""
echo "======================================="
echo " Совпало: ${PASS} / Расхождений: ${FAIL}"
echo "======================================="

if [ "$FAIL" -gt 0 ]; then
  echo " СТАТУС: ПРОВАЛ"
  echo " Проблемные таблицы:${FAILED_TABLES}"
  echo ""
  echo " НЕ ПРОДОЛЖАЙ cutover! Разберись с расхождением."
  exit 1
else
  echo " СТАТУС: OK — данные перенесены полностью"
  exit 0
fi
