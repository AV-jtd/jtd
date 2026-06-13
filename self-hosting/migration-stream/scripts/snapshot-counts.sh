#!/usr/bin/env bash
# Снимок row counts по ключевым таблицам (для фиксации состояния перед/после).
# Использование: ./snapshot-counts.sh "<DB_URL>" > snapshot.txt

set -euo pipefail
DB="${1:?Укажи DB connection string}"

TABLES="
auth.users public.profiles public.tasks public.task_groups
public.task_comments public.subtasks public.group_messages
public.clients public.user_roles storage.objects
"

echo "# Snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
for T in $TABLES; do
  C=$(psql "$DB" -tAc "SELECT COUNT(*) FROM $T;" 2>/dev/null || echo "ERR")
  printf "%-30s %s\n" "$T" "$C"
done
