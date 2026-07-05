#!/usr/bin/env python3
"""
Загружает CSV-файлы в таблицы, автоматически сопоставляя колонки.
Пропускает колонки из CSV, которых нет в реальной таблице.
Запускает всё в одной сессии с session_replication_role = 'replica'.
"""
import csv
import io
import subprocess
import sys
import os

CSV_DIR = "/tmp/supabase-backup/supabase-backup/csv"
CONTAINER = "self-hosting-db-1"
DB_USER = "postgres"
DB_NAME = "postgres"

# Таблицы для загрузки (в порядке зависимостей)
TABLES = [
    "profiles",
    "user_roles",
    "user_settings",
    "tags",
    "tag_access",
    "task_groups",
    "project_milestones",
    "department_directors",
    "tasks",
    "subtasks",
    "task_participants",
    "task_tags",
    "task_dependencies",
    "task_comments",
    "group_members",
    "group_messages",
    "group_tags",
    "team_members",
    "decisions",
    "decision_projects",
    "kanban_card_positions",
    "npd_card_positions",
    "project_folder_items",
    "telegram_group_chats",
    "telegram_pending_context",
    "wiki_pages",
    "wiki_structured_sections",
    "chat_link_tokens",
]

def get_table_columns(table):
    """Получить список колонок таблицы из БД."""
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-c",
         f"SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}' ORDER BY ordinal_position;"],
        capture_output=True, text=True
    )
    cols = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return cols

def load_table(table):
    csv_path = os.path.join(CSV_DIR, f"{table}.csv")
    if not os.path.exists(csv_path):
        print(f"  SKIP {table}: нет CSV-файла")
        return 0, 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        csv_cols = reader.fieldnames
        rows = list(reader)

    if not rows:
        print(f"  SKIP {table}: CSV пустой")
        return 0, 0

    db_cols = get_table_columns(table)
    if not db_cols:
        print(f"  SKIP {table}: таблица не найдена в БД")
        return 0, 0

    # Только колонки которые есть и в CSV и в таблице
    common_cols = [c for c in csv_cols if c in db_cols]
    skipped_cols = [c for c in csv_cols if c not in db_cols]

    if skipped_cols:
        print(f"  {table}: пропускаем CSV-колонки {skipped_cols}")

    # Генерируем filtered CSV в памяти
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=common_cols, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({c: row[c] for c in common_cols})
    csv_data = buf.getvalue()

    # COPY через stdin в одной транзакции с session_replication_role уже установленным
    cols_str = ",".join(common_cols)
    sql = f"\\copy public.{table} ({cols_str}) FROM STDIN WITH (FORMAT csv, HEADER true)"
    proc = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql],
        input=csv_data,
        capture_output=True, text=True
    )
    if proc.returncode != 0:
        print(f"  ОШИБКА {table}: {proc.stderr.strip()}", file=sys.stderr)
        return len(rows), -1

    # Парсим "COPY N" из вывода
    loaded = 0
    for line in proc.stdout.splitlines():
        if line.startswith("COPY "):
            loaded = int(line.split()[1])
    return len(rows), loaded

def set_session_replication_role(role):
    """Установить session_replication_role через temporary function trick."""
    # Используем ALTER ROLE для сессии — это работает в рамках одного psql вызова
    subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c",
         f"SET session_replication_role = '{role}';"],
        capture_output=True, text=True
    )

print("=== Загрузка таблиц, зависящих от auth.users ===")
print()

# session_replication_role НЕ работает между psql-вызовами, поэтому
# мы обходим FK через ALTER TABLE DISABLE TRIGGER.
# Отключим триггеры и FK для каждой таблицы перед загрузкой.

errors = []
total_rows = 0

for table in TABLES:
    csv_path = os.path.join(CSV_DIR, f"{table}.csv")
    if not os.path.exists(csv_path):
        print(f"  SKIP {table}: нет CSV")
        continue

    with open(csv_path, newline="", encoding="utf-8") as f:
        first_line = f.readline()
        row_count = sum(1 for _ in f)

    if row_count == 0:
        print(f"  SKIP {table}: 0 строк")
        continue

    # Отключаем триггеры на таблице
    subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c",
         f"ALTER TABLE public.{table} DISABLE TRIGGER ALL;"],
        capture_output=True, text=True
    )

    print(f"  Загружаю {table} ({row_count} строк)...", end=" ", flush=True)
    csv_rows, loaded = load_table(table)
    if loaded >= 0:
        print(f"OK ({loaded})")
        total_rows += loaded
    else:
        print(f"ОШИБКА")
        errors.append(table)

    # Восстанавливаем триггеры
    subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c",
         f"ALTER TABLE public.{table} ENABLE TRIGGER ALL;"],
        capture_output=True, text=True
    )

print()
print(f"Загружено строк итого: {total_rows}")
if errors:
    print(f"Таблицы с ошибками: {errors}", file=sys.stderr)

# Итоговая статистика
print()
print("=== Итоговые счётчики =====")
result = subprocess.run(
    ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c",
     """SELECT tablename,
  (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int AS row_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;"""],
    capture_output=True, text=True
)
print(result.stdout)
