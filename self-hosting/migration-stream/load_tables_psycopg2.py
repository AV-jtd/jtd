#!/usr/bin/env python3
"""
Загружает CSV-файлы в таблицы через psycopg2 с session_replication_role = 'replica'.
Это отключает FK-проверки и триггеры в одной сессии.
"""
import csv
import io
import sys
import os
import psycopg2

CSV_DIR = "/tmp/supabase-backup/supabase-backup/csv"
DB_HOST = "172.19.0.8"
DB_PORT = 5432
DB_USER = "postgres"
DB_NAME = "postgres"
DB_PASS = "iwev3gEdoh2umKSnB7jqUOKAjlk0xF66"

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

def get_table_columns(cur, table):
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position",
        (table,)
    )
    return [row[0] for row in cur.fetchall()]

def load_table(conn, cur, table):
    csv_path = os.path.join(CSV_DIR, f"{table}.csv")
    if not os.path.exists(csv_path):
        print(f"  SKIP {table}: нет CSV")
        return 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        csv_cols = reader.fieldnames
        rows = list(reader)

    if not rows:
        print(f"  SKIP {table}: пустой CSV")
        return 0

    db_cols = get_table_columns(cur, table)
    common_cols = [c for c in csv_cols if c in db_cols]
    skipped = [c for c in csv_cols if c not in db_cols]

    if skipped:
        print(f"    (пропускаем CSV-колонки: {skipped})")

    # Строим filtered CSV в памяти
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=common_cols, lineterminator="\n",
                             extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow({c: row[c] for c in common_cols})
    buf.seek(0)

    cols_str = ", ".join(f'"{c}"' for c in common_cols)
    copy_sql = f'COPY public."{table}" ({cols_str}) FROM STDIN WITH (FORMAT csv, HEADER true)'
    cur.copy_expert(copy_sql, buf)
    return len(rows)

print("=== Загрузка зависимых таблиц через psycopg2 ===")
print(f"Подключение: {DB_HOST}:{DB_PORT}/{DB_NAME}")
print()

conn = psycopg2.connect(
    host=DB_HOST, port=DB_PORT,
    user=DB_USER, password=DB_PASS,
    dbname=DB_NAME
)
conn.autocommit = False

cur = conn.cursor()

# Отключаем FK и триггеры для всей сессии
cur.execute("SET session_replication_role = 'replica';")
print("session_replication_role = replica (FK и триггеры отключены)")
print()

total = 0
errors = []

for table in TABLES:
    csv_path = os.path.join(CSV_DIR, f"{table}.csv")
    if not os.path.exists(csv_path):
        print(f"  SKIP {table}: нет CSV-файла")
        continue

    with open(csv_path) as f:
        row_count = sum(1 for _ in f) - 1

    if row_count <= 0:
        print(f"  SKIP {table}: 0 строк")
        continue

    print(f"  {table} ({row_count} строк)...", end=" ", flush=True)
    try:
        n = load_table(conn, cur, table)
        print(f"OK → {n}")
        total += n
    except Exception as e:
        print(f"ОШИБКА: {e}")
        errors.append((table, str(e)))
        conn.rollback()
        cur.execute("SET session_replication_role = 'replica';")

cur.execute("SET session_replication_role = 'origin';")
conn.commit()
cur.close()
conn.close()

print()
print(f"Итого загружено строк: {total}")
if errors:
    print(f"\nОШИБКИ ({len(errors)}):")
    for t, e in errors:
        print(f"  {t}: {e}")
    sys.exit(1)

print()
print("=== Итоговые счётчики ===")
conn2 = psycopg2.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS, dbname=DB_NAME)
cur2 = conn2.cursor()
cur2.execute("""
    SELECT tablename,
      (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', tablename), false, true, '')))[1]::text::int AS row_count
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
""")
for row in cur2.fetchall():
    status = "✅" if row[1] > 0 else "⬜"
    print(f"  {status} {row[0]}: {row[1]}")
cur2.close()
conn2.close()
