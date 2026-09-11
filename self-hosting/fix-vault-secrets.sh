#!/usr/bin/env bash
# Перезаписывает секреты в vault значениями этой установки.
#
# Зачем: 11 сентября выяснилось, что регистрация через бота падает, а в логе
# видно только "[/register] createUser failed: AuthRetryableFetchError: {}".
# Это не сетевая ошибка: supabase-js записывает HTTP 500 от GoTrue в класс
# "retryable fetch" и теряет тело ответа. Настоящая ошибка ниже —
#
#   pgsodium_crypto_aead_det_decrypt_by_id: invalid ciphertext
#
# Цепочка: INSERT в auth.users → триггер handle_new_user → вставка в profiles
# → триггер notify_new_user_registration → чтение vault.decrypted_secrets.
# Чтение падает, транзакция откатывается, пользователь не создаётся.
#
# Причина: строки SUPABASE_URL и SUPABASE_ANON_KEY в vault созданы 18 июня
# 2026 и приехали сюда вместе с дампом из облака Lovable. Зашифрованы они
# корневым ключом pgsodium того облака, а на этом сервере ключ другой —
# расшифровать их нельзя в принципе. Новые секреты, созданные здесь,
# шифруются и читаются нормально, так что лечится перезаписью.
#
# От тех же двух секретов зависят ещё три функции, которые всё это время
# молча не работали:
#   public.email_queue_dispatch
#   public.email_queue_wake
#   public.notify_department_head_on_assign
#
# SUPABASE_URL ставится в http://kong:8000 — так же, как во всех заданиях
# pg_cron: это адрес шлюза внутри docker-сети, а не публичный домен.
#
# Запуск: bash self-hosting/fix-vault-secrets.sh
# Повторный запуск безопасен.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=self-hosting/.env.supabase
DB=self-hosting-db-1

ANON_KEY=$(grep '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$ANON_KEY" ]; then
  echo "ANON_KEY не найден в $ENV_FILE" >&2
  exit 1
fi

echo "Было:"
docker exec "$DB" psql -U postgres -d postgres -c \
  "SELECT name, created_at FROM vault.secrets ORDER BY name;"

# Старые строки удаляются, а не обновляются: vault.update_secret сам читает
# vault.decrypted_secrets и падает на той же нерасшифровываемой строке.
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
BEGIN;
DELETE FROM vault.secrets WHERE name IN ('SUPABASE_URL', 'SUPABASE_ANON_KEY');
SELECT vault.create_secret('http://kong:8000', 'SUPABASE_URL',
  'Адрес шлюза Kong внутри docker-сети. Используется триггерами через net.http_post.');
SELECT vault.create_secret('${ANON_KEY}', 'SUPABASE_ANON_KEY',
  'anon-ключ этой установки. Значение берётся из self-hosting/.env.supabase.');
COMMIT;
SQL

echo
echo "Стало (проверка расшифровки):"
docker exec "$DB" psql -U postgres -d postgres -c \
  "SELECT name, left(decrypted_secret, 28) || '…' AS начало_значения
   FROM vault.decrypted_secrets ORDER BY name;"
