#!/bin/bash
# Загружает все таблицы, зависящие от auth.users, с отключёнными FK и триггерами.
# Запускать после создания пользователей в auth.users.

set -euo pipefail

CSV_DIR="/tmp/supabase-backup/supabase-backup/csv"
CONTAINER="self-hosting-db-1"
DB_USER="postgres"
DB_NAME="postgres"

psql_cmd() {
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

psql_copy() {
    local table="$1"
    local csv_file="$CSV_DIR/$table.csv"

    if [ ! -f "$csv_file" ]; then
        echo "  SKIP: нет файла $csv_file"
        return
    fi

    local rows=$(wc -l < "$csv_file")
    rows=$((rows - 1))  # минус заголовок

    if [ "$rows" -le 0 ]; then
        echo "  SKIP: $table — CSV пустой"
        return
    fi

    echo "  Загружаю $table ($rows строк)..."

    # Получаем заголовок (колонки) из CSV
    local header=$(head -1 "$csv_file")

    # COPY через stdin
    (echo "\\copy public.$table ($header) FROM STDIN WITH (FORMAT csv, HEADER true);" && cat "$csv_file") | \
        psql_cmd 2>&1
}

echo "=== Загрузка зависимых таблиц ==="
echo "Начало: $(date)"
echo ""

# Открываем транзакцию с отключёнными триггерами и FK
echo "Отключаем триггеры (session_replication_role = replica)..."
psql_cmd -c "SET session_replication_role = 'replica';" 2>&1

# Загружаем таблицы в правильном порядке
# (с session_replication_role=replica FK не проверяются, но порядок сохраняем для читаемости)

echo ""
echo "--- Базовые пользовательские данные ---"
psql_copy profiles
psql_copy user_roles
psql_copy user_settings

echo ""
echo "--- Теги ---"
psql_copy tags
psql_copy tag_access

echo ""
echo "--- Структуры проектов ---"
psql_copy task_groups
psql_copy project_milestones
psql_copy department_directors

echo ""
echo "--- Задачи и комментарии ---"
psql_copy tasks
psql_copy subtasks
psql_copy task_comments
psql_copy task_participants
psql_copy task_tags
psql_copy task_dependencies

echo ""
echo "--- Группы и сообщения ---"
psql_copy group_members
psql_copy group_messages
psql_copy group_tags

echo ""
echo "--- Команды ---"
psql_copy team_members

echo ""
echo "--- Решения ---"
psql_copy decisions
psql_copy decision_projects

echo ""
echo "--- Kanban и папки ---"
psql_copy kanban_card_positions
psql_copy npd_card_positions
psql_copy project_folder_items

echo ""
echo "--- Telegram ---"
psql_copy telegram_group_chats
psql_copy telegram_pending_context

echo ""
echo "--- Wiki ---"
psql_copy wiki_pages
psql_copy wiki_structured_sections

echo ""
echo "--- Прочее ---"
psql_copy chat_link_tokens

# Восстанавливаем триггеры
echo ""
echo "Восстанавливаем триггеры (session_replication_role = origin)..."
psql_cmd -c "SET session_replication_role = 'origin';" 2>&1

echo ""
echo "=== Проверка итоговых счётчиков ==="
psql_cmd -c "
SELECT tablename,
  (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'public'
  AND (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int > 0
ORDER BY row_count DESC;" 2>&1

echo ""
echo "Конец: $(date)"
