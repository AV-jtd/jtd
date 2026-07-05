#!/usr/bin/env python3
"""
Создаёт пользователей в auth.users из profiles.csv с теми же UUID.
Пароль — временный (random UUID), пользователи получат reset-письмо после cutover.
"""
import csv
import uuid
import bcrypt
import subprocess
import sys

CSV_PATH = "/tmp/supabase-backup/supabase-backup/csv/profiles.csv"
CONTAINER = "self-hosting-db-1"
DB_USER = "postgres"
DB_NAME = "postgres"

def bcrypt_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()

def run_sql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME],
        input=sql,
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}", file=sys.stderr)
    return result.stdout + result.stderr

# Читаем профили
users = []
with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        users.append({
            "id": row["id"],
            "email": row["email"].strip(),
            "created_at": row["created_at"],
        })

print(f"Загружено {len(users)} пользователей из CSV")

# Генерируем временные пароли и хэши
temp_password = str(uuid.uuid4())  # один пароль для всех (всё равно будет сброс)
pw_hash = bcrypt_hash(temp_password)
print(f"Временный пароль (все пользователи): {temp_password}")
print(f"Bcrypt hash: {pw_hash[:20]}...")

# Строим SQL
values = []
for u in users:
    eid = u["id"].replace("'", "''")
    email = u["email"].replace("'", "''")
    created_at = u["created_at"].replace("'", "''")
    pw = pw_hash.replace("'", "''")
    values.append(
        f"('{eid}', 'authenticated', 'authenticated', '{email}', '{pw}', "
        f"now(), now(), now(), "
        f"'{{}}'::jsonb, '{{}}'::jsonb, '{created_at}'::timestamptz)"
    )

values_str = ",\n".join(values)
sql = f"""
BEGIN;
-- Отключаем триггеры (в т.ч. handle_new_user/seed_onboarding_data)
SET session_replication_role = 'replica';
INSERT INTO auth.users
  (id, aud, role, email, encrypted_password,
   email_confirmed_at, last_sign_in_at, updated_at,
   raw_app_meta_data, raw_user_meta_data, created_at)
VALUES
{values_str}
ON CONFLICT (id) DO NOTHING;
-- Восстанавливаем триггеры
SET session_replication_role = 'origin';
SELECT COUNT(*) AS auth_users_count FROM auth.users;
COMMIT;
"""

print("\nВставляю пользователей в auth.users...")
out = run_sql(sql)
print(out)

# Проверка
print("\nПроверка:")
check = run_sql("SELECT COUNT(*) FROM auth.users;")
print(check)
