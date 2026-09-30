#!/usr/bin/env bash
# Предупреждение владельцу о балансе ключа OpenRouter (решение владельца 01.10.2026).
#
# На ключе стоит лимит ($25 на 01.10). Когда он кончится, встанут ассистент в
# приложении и остальные ИИ-функции — у всех сразу и без внятной ошибки для
# людей. Поэтому раз в час смотрим остаток и пишем администраторам в Telegram
# при пересечении порогов $5, $2, $0.5 — по одному сообщению на порог, а не
# каждый час. Если баланс пополнили — пороги сбрасываются.
#
# Запуск: cron, раз в час. Проверка без отправки: --dry-run.
set -uo pipefail
ENV_FILE=/opt/jtd/self-hosting/.env.supabase
STATE=/var/lib/jtd/openrouter-alert.state
mkdir -p "$(dirname "$STATE")"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

KEY="$(grep -E '^OPENROUTER_API_KEY=' "$ENV_FILE" | cut -d= -f2-)"
BOT="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$KEY" ] && [ -n "$BOT" ] || { echo "нет ключей в $ENV_FILE"; exit 1; }

read -r LIMIT REMAIN USAGE < <(curl -s -m 20 -H "Authorization: Bearer $KEY" https://openrouter.ai/api/v1/key \
  | python3 -c 'import json,sys;d=json.load(sys.stdin)["data"];print(d.get("limit"), d.get("limit_remaining"), round(d.get("usage",0),2))')
# Для проверки порогов: OR_TEST_REMAIN=4.2 bash openrouter-balance.sh --dry-run
[ "$DRY" = 1 ] && [ -n "${OR_TEST_REMAIN:-}" ] && REMAIN="$OR_TEST_REMAIN"
if [ -z "${REMAIN:-}" ] || [ "$REMAIN" = "None" ]; then
  echo "$(date '+%F %T') лимита на ключе нет или ответ не разобран — выхожу"; exit 0
fi

# Самый низкий пересечённый порог.
LEVEL=$(python3 -c "r=float('$REMAIN');print(next((t for t in ('0.5','2','5') if r<float(t)),'ok'))")
PREV="$(cat "$STATE" 2>/dev/null || echo ok)"
echo "$(date '+%F %T') остаток \$$REMAIN из \$$LIMIT, порог: $LEVEL (был: $PREV)"

if [ "$LEVEL" = "ok" ]; then
  [ "$DRY" = 1 ] || echo ok > "$STATE"; exit 0
fi
[ "$LEVEL" = "$PREV" ] && exit 0   # об этом пороге уже писали

MSG="⚠️ Баланс ИИ (OpenRouter) на исходе: осталось \$$(LC_NUMERIC=C printf '%.2f' "$REMAIN") из \$$LIMIT (израсходовано \$$USAGE).

Когда он закончится, ассистент в приложении и ИИ-функции перестанут работать у всех. Пополнить или поднять лимит ключа: openrouter.ai → Keys.

— ваш дружелюбный ИИ-помощник"
CHATS="$(docker exec self-hosting-db-1 psql -U postgres -tAc "
  SELECT DISTINCT b.chat_id FROM public.user_roles r
  JOIN public.profiles p ON p.id = r.user_id
  JOIN public.telegram_bot_chats b ON lower(b.telegram_username) = lower(p.telegram_username)
  WHERE r.role = 'admin' AND b.chat_id > 0;")"
if [ "$DRY" = 1 ]; then echo "--dry-run, получателей: $(printf '%s\n' "$CHATS" | grep -c .)"; printf '%s\n' "$MSG"; exit 0; fi
while IFS= read -r c; do
  [ -z "$c" ] && continue
  curl -s -o /dev/null -m 15 "https://api.telegram.org/bot${BOT}/sendMessage" --data-urlencode "chat_id=$c" --data-urlencode "text=$MSG"
done <<< "$CHATS"
echo "$LEVEL" > "$STATE"
