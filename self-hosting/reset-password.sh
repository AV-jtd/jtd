#!/usr/bin/env bash
# Сброс пароля сотрудника с отправкой нового в личку ботом.
#
# Использование:
#   bash reset-password.sh <кого>            — найти, сменить пароль, прислать в Telegram
#   bash reset-password.sh <кого> --print    — то же, но напечатать пароль в терминал
#                                              (нужно, когда Telegram не привязан)
#
# <кого> — часть email, имени или ника в Telegram. Например: suslovaa
#
# Пароль НЕ печатается в терминал без --print: он уходит только в Telegram,
# чтобы не осесть в истории команд и на скриншотах.
#
# Важно: если Telegram у человека не привязан, скрипт останавливается ДО смены
# пароля. Иначе сотрудник остался бы с паролем, которого никто не знает.

set -uo pipefail

REPO_DIR="/opt/jtd"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
KONG="http://localhost:8000"
SITE="https://justtodoit.ru"

die() { printf '\033[31mОшибка:\033[0m %s\n' "$1" >&2; exit 1; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; }

WHO="${1:-}"; MODE="${2:-}"
[ -n "$WHO" ] || { echo "Использование: bash $0 <часть email, имени или ника> [--print]"; exit 2; }
# Проверку по «разрешённым символам» здесь делать нельзя: диапазоны вроде
# А-Яа-я в классе символов не работают при локали C, и поиск по русской
# фамилии отбраковывался бы как подозрительный. От инъекции защищает sql_lit
# ниже — он удваивает одинарные кавычки, а других путей в SQL у аргумента нет.
[ "${#WHO}" -ge 2 ] || die "слишком короткий запрос: «$WHO»"
case "$WHO" in *$'\n'*) die "перенос строки в запросе" ;; esac

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }
SERVICE_KEY="$(getenv SERVICE_ROLE_KEY)"; [ -n "$SERVICE_KEY" ] || die "SERVICE_ROLE_KEY не найден в $ENV_FILE"
BOT_TOKEN="$(getenv TELEGRAM_BOT_TOKEN)";  [ -n "$BOT_TOKEN" ]  || die "TELEGRAM_BOT_TOKEN не найден в $ENV_FILE"

psql_q() { docker exec self-hosting-db-1 psql -U postgres -tAc "$1" 2>/dev/null | tr -d '\r'; }
sql_lit() { printf "%s" "$1" | sed "s/'/''/g"; }
L="$(sql_lit "$WHO")"

# ---------- 1. Кого меняем ----------
# Ищем по трём полям сразу: часто помнят только логин или только фамилию.
FOUND="$(psql_q "
  SELECT u.id||'|'||coalesce(p.display_name,'—')||'|'||u.email||'|'||coalesce(p.telegram_chat_id::text,'')
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.email ILIKE '%$L%'
     OR p.display_name ILIKE '%$L%'
     OR p.telegram_username ILIKE '%$L%'
  ORDER BY u.email")"

COUNT="$(printf '%s' "$FOUND" | grep -c . || true)"
if [ "$COUNT" = "0" ]; then
  die "никто не найден по «$WHO». Проверьте написание или поищите так:
  docker exec self-hosting-db-1 psql -U postgres -c \"SELECT display_name, telegram_username FROM profiles ORDER BY display_name;\""
fi
if [ "$COUNT" != "1" ]; then
  printf 'Под «%s» подходит несколько человек — уточните запрос:\n' "$WHO"
  printf '%s\n' "$FOUND" | awk -F'|' '{printf "  %s  <%s>\n", $2, $3}'
  exit 2
fi

USER_ID="${FOUND%%|*}"; rest="${FOUND#*|}"
NAME="${rest%%|*}";     rest="${rest#*|}"
EMAIL="${rest%%|*}"
CHAT_ID="${rest#*|}"

printf 'Найден: \033[1m%s\033[0m <%s>\n' "$NAME" "$EMAIL"

# ---------- 2. Куда отправим ----------
# Проверяем ДО смены пароля: менять то, что не сможем доставить, нельзя.
if [ -z "$CHAT_ID" ] || [ "$CHAT_ID" = "0" ]; then
  [ "$MODE" = "--print" ] || die "у $NAME не привязан Telegram — отправить пароль некуда.
Либо пусть напишет боту (тогда привязка подхватится), либо запустите с --print
и передайте пароль лично:
  bash $0 $WHO --print"
  ok "Telegram не привязан, пароль будет напечатан здесь"
else
  ok "Telegram привязан (chat_id $CHAT_ID)"
fi

# ---------- 3. Новый пароль ----------
# Алфавит без похожих символов (0/O, 1/l/I) — пароль диктуют голосом.
PASS="$(LC_ALL=C tr -dc 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789' </dev/urandom | head -c 16)"
[ "${#PASS}" -eq 16 ] || die "не удалось сгенерировать пароль"

# ---------- 4. Смена через админский API ----------
# user_metadata сначала читаем и дополняем: админский PUT заменяет объект
# целиком, и отправив только must_change_password, мы стёрли бы display_name.
CUR="$(curl -s --max-time 20 "$KONG/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY")"
printf '%s' "$CUR" | grep -q '"id"' || die "не удалось прочитать пользователя. Ответ: $CUR"

payload="$(CUR="$CUR" PASS="$PASS" python3 -c '
import json, os, sys
cur = json.loads(os.environ["CUR"])
meta = cur.get("user_metadata") or {}
meta["must_change_password"] = True
print(json.dumps({"password": os.environ["PASS"], "user_metadata": meta}))')" \
  || die "не удалось собрать запрос (нужен python3)"

resp="$(curl -s --max-time 30 -X PUT "$KONG/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -d "$payload")"
printf '%s' "$resp" | grep -q '"id"' || die "пароль НЕ изменён. Ответ: $resp"
ok "пароль изменён"

# ---------- 5. Доставка ----------
if [ -n "$CHAT_ID" ] && [ "$CHAT_ID" != "0" ]; then
  msg="🔑 Для вас сброшен пароль в JustTODOit.

Email: $EMAIL
Новый пароль: $PASS

Войдите на $SITE и сразу смените пароль в настройках профиля."
  send="$(curl -s --max-time 20 -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
    -H "Content-Type: application/json" \
    -d "$(MSG="$msg" CHAT="$CHAT_ID" python3 -c '
import json, os
print(json.dumps({"chat_id": int(os.environ["CHAT"]), "text": os.environ["MSG"]}))')")"
  if printf '%s' "$send" | grep -q '"ok":true'; then
    ok "пароль отправлен в Telegram — в терминал не печатаю"
    [ "$MODE" = "--print" ] && printf '\033[33mПароль:\033[0m %s\n' "$PASS"
  else
    printf '\033[33mTelegram не принял сообщение:\033[0m %s\n' "$send"
    printf '\033[33mПароль (передайте лично):\033[0m %s\n' "$PASS"
  fi
else
  printf '\033[33mПароль (передайте лично, попросите сменить):\033[0m %s\n' "$PASS"
fi

echo
echo "Готово. $NAME <$EMAIL>"
