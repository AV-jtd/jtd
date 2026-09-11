#!/usr/bin/env bash
# Создание пользователя вручную — тем же способом, что и /register в боте,
# но с сервера. Нужен, пока createUser из edge-функции падает с
# AuthRetryableFetchError.
#
# Делает ровно то же, что бот:
#   1) заводит пользователя в auth (email сразу подтверждён, письма не шлются);
#   2) дозаполняет профиль: компания, рабочий email, telegram;
#   3) присылает логин и временный пароль в личку ботом;
#   4) убирает недоделанный контекст регистрации.
#
# Пароль НЕ печатается в терминал: он уходит только в Telegram, чтобы не
# осесть в истории команд и на скриншотах. Если отправка не удалась —
# тогда печатается, иначе доступы будут потеряны.
#
# Использование:
#   bash create-user.sh <email> "<Имя Фамилия>" "<Компания>" [chat_id] [tg_username]
#
# chat_id можно не указывать: скрипт возьмёт его из незавершённой регистрации,
# если человек только что отправил боту /register. Так Telegram привязывается
# сразу, без ручного поиска идентификатора.

set -uo pipefail

REPO_DIR="/opt/jtd"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
KONG="http://localhost:8000"
SITE="https://justtodoit.ru"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }

EMAIL="${1:-}"; NAME="${2:-}"; COMPANY="${3:-}"; CHAT_ID="${4:-}"; TG_USER="${5:-}"
[ -n "$EMAIL" ] && [ -n "$NAME" ] && [ -n "$COMPANY" ] || {
  echo "Использование: bash $0 <email> \"<Имя Фамилия>\" \"<Компания>\" [chat_id] [tg_username]"
  exit 2
}
EMAIL="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
printf '%s' "$EMAIL" | grep -qE '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' || die "не похоже на email: $EMAIL"

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }
SERVICE_KEY="$(getenv SERVICE_ROLE_KEY)"; [ -n "$SERVICE_KEY" ] || die "SERVICE_ROLE_KEY не найден в $ENV_FILE"
BOT_TOKEN="$(getenv TELEGRAM_BOT_TOKEN)";  [ -n "$BOT_TOKEN" ]  || die "TELEGRAM_BOT_TOKEN не найден в $ENV_FILE"

psql_q() { docker exec self-hosting-db-1 psql -U postgres -tAc "$1" 2>/dev/null | tr -d '\r'; }
sql_lit() { printf "%s" "$1" | sed "s/'/''/g"; }   # экранирование кавычек для SQL

# ---------- 1. Пользователь уже есть? ----------
# Проверяем в auth.users, а НЕ в profiles: источник истины именно там.
# В боте проверка смотрит в profiles, и пользователь, заведённый без профиля,
# её проходит, после чего createUser падает на уникальности email.
exists="$(psql_q "SELECT id FROM auth.users WHERE email ILIKE '$(sql_lit "$EMAIL")' LIMIT 1")"
[ -z "$exists" ] || die "пользователь с $EMAIL уже существует (id $exists)"

# ---------- 2. chat_id ----------
if [ -z "$CHAT_ID" ]; then
  rows="$(psql_q "SELECT chat_id FROM public.telegram_pending_context WHERE context_type LIKE 'register%' AND created_at > now() - interval '30 minutes'")"
  count="$(printf '%s' "$rows" | grep -c . || true)"
  case "$count" in
    1) CHAT_ID="$rows"; ok "chat_id из незавершённой регистрации: $CHAT_ID" ;;
    0) die "chat_id не указан и незавершённых регистраций нет. Попросите человека отправить боту /register и повторите, либо укажите chat_id четвёртым аргументом." ;;
    *) printf 'Незавершённых регистраций несколько:\n%s\nУкажите нужный chat_id четвёртым аргументом.\n' "$rows"; exit 2 ;;
  esac
fi
printf '%s' "$CHAT_ID" | grep -qE '^-?[0-9]+$' || die "chat_id должен быть числом, получено: $CHAT_ID"

# ---------- 3. Временный пароль ----------
# Тот же алфавит, что в боте: без похожих друг на друга символов (0/O, 1/l/I).
PASS="$(LC_ALL=C tr -dc 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' </dev/urandom | head -c 16)"
[ "${#PASS}" -eq 16 ] || die "не удалось сгенерировать пароль"

# ---------- 4. Создание в auth ----------
payload="$(NAME="$NAME" EMAIL="$EMAIL" PASS="$PASS" python3 -c '
import json, os
print(json.dumps({
  "email": os.environ["EMAIL"],
  "password": os.environ["PASS"],
  "email_confirm": True,
  "user_metadata": {"display_name": os.environ["NAME"], "must_change_password": True},
}))')" || die "не удалось собрать запрос (нужен python3)"

resp="$(curl -s --max-time 30 -X POST "$KONG/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -d "$payload")"
USER_ID="$(printf '%s' "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null)"
[ -n "$USER_ID" ] || die "auth не создал пользователя. Ответ: $resp"
ok "пользователь создан: $USER_ID"

# ---------- 5. Профиль ----------
# profiles создаёт триггер handle_new_user — он срабатывает в той же
# транзакции, но подождём на случай задержки, иначе UPDATE не найдёт строку.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  [ -n "$(psql_q "SELECT id FROM public.profiles WHERE id='$USER_ID'")" ] && break
  sleep 1
done
[ -n "$(psql_q "SELECT id FROM public.profiles WHERE id='$USER_ID'")" ] || die "профиль для $USER_ID не появился — проверьте триггер handle_new_user"

TG_CLEAN="$(printf '%s' "$TG_USER" | sed 's/^@//' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
tg_sql="NULL"; [ -n "$TG_CLEAN" ] && tg_sql="'$(sql_lit "$TG_CLEAN")'"
psql_q "UPDATE public.profiles SET organization='$(sql_lit "$COMPANY")', work_email='$(sql_lit "$EMAIL")', telegram_username=COALESCE($tg_sql, telegram_username), telegram_chat_id=$CHAT_ID WHERE id='$USER_ID'" >/dev/null
ok "профиль дозаполнен, Telegram привязан (chat_id $CHAT_ID)"

# ---------- 6. Доступы в личку ----------
msg="🎉 Готово! Аккаунт создан.

Email: $EMAIL
Временный пароль: $PASS

Войдите на $SITE и сразу смените пароль в настройках профиля."
send="$(curl -s --max-time 20 -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$(MSG="$msg" CHAT="$CHAT_ID" python3 -c '
import json, os
print(json.dumps({"chat_id": int(os.environ["CHAT"]), "text": os.environ["MSG"]}))')")"
if printf '%s' "$send" | grep -q '"ok":true'; then
  ok "доступы отправлены в Telegram — в терминал пароль не печатаю"
else
  printf '\033[33mTelegram не принял сообщение:\033[0m %s\n' "$send"
  printf '\033[33mПароль (передайте лично и попросите сменить):\033[0m %s\n' "$PASS"
fi

# ---------- 7. Уборка ----------
psql_q "DELETE FROM public.telegram_pending_context WHERE chat_id=$CHAT_ID" >/dev/null
ok "контекст регистрации очищен"
echo
echo "Готово. $NAME ($EMAIL) может входить на $SITE"
