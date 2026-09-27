#!/usr/bin/env bash
# Напоминание владельцу о вопросах, которые ждут его ответа.
#
# Зачем: обе сессии Claude регулярно упираются в решения, которые может принять
# только человек (доступ к почтовому ящику, выбор варианта, разрешение на
# рискованное действие). Сессия при этом заканчивается, вопрос остаётся в
# файле, и о нём просто забывают. Скрипт раз в сутки присылает в Telegram
# короткий список того, что висит.
#
# Где живут вопросы: self-hosting/BACKLOG.md, строки строго такого вида —
#
#   - [ ] 2026-09-27 — текст вопроса
#
# Снять вопрос: поменять [ ] на [x] или удалить строку. Ничего больше скрипт
# не разбирает, поэтому формат менять нельзя.
#
# Читается НЕ рабочее дерево, а свежая ветка с GitHub. Рабочее дерево на
# сервере обновляется только при выкатке, а вопрос может добавить сессия,
# которая работает не здесь, — тогда в дереве его ещё нет. Заодно скрипт не
# трогает файлы: обе сессии работают в этом же каталоге.
#
# Установка (крон хоста, рядом с ежедневным бэкапом):
#   crontab -e
#   0 10 * * * /opt/jtd/self-hosting/remind-owner.sh >> /var/log/jtd-remind.log 2>&1
#
# Проверить вручную, ничего не отправляя: bash remind-owner.sh --dry-run

set -uo pipefail

REPO_DIR="/opt/jtd"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
BRANCH="claude/modest-hawking-sfszra"
# Вопрос, заданный сегодня, не дёргаем: у человека должен быть день на ответ.
MIN_AGE_DAYS=1
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

cd "$REPO_DIR" || exit 1

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

BOT_TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
if [ -z "$BOT_TOKEN" ]; then
  log "TELEGRAM_BOT_TOKEN не найден — выхожу"
  exit 1
fi

# --- Свежая копия бэклога ---
git fetch origin "$BRANCH" main --quiet 2>/dev/null
BACKLOG=""
for ref in "origin/$BRANCH" "origin/main"; do
  BACKLOG="$(git show "$ref:self-hosting/BACKLOG.md" 2>/dev/null)" && [ -n "$BACKLOG" ] && break
done
if [ -z "$BACKLOG" ]; then
  log "BACKLOG.md не удалось прочитать ни из одной ветки — выхожу"
  exit 1
fi

# --- Незакрытые вопросы старше порога ---
today_epoch="$(date +%s)"
pending=""
count=0
while IFS= read -r line; do
  # - [ ] 2026-09-27 — текст
  d="$(printf '%s' "$line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)"
  [ -z "$d" ] && continue
  asked_epoch="$(date -d "$d" +%s 2>/dev/null)" || continue
  age=$(( (today_epoch - asked_epoch) / 86400 ))
  [ "$age" -lt "$MIN_AGE_DAYS" ] && continue
  text="$(printf '%s' "$line" | sed -E 's/^- \[ \] [0-9]{4}-[0-9]{2}-[0-9]{2} (— )?//')"
  pending="${pending}• ${text} (ждёт ${age} дн.)"$'\n'
  count=$((count+1))
done < <(printf '%s\n' "$BACKLOG" | grep -E '^- \[ \] [0-9]{4}-[0-9]{2}-[0-9]{2}')

if [ "$count" -eq 0 ]; then
  log "незакрытых вопросов старше ${MIN_AGE_DAYS} дн. нет — молчу"
  exit 0
fi

msg="🔔 Ждут вашего решения (${count}):"$'\n\n'"${pending}"$'\n'"Снять вопрос: в self-hosting/BACKLOG.md поменять [ ] на [x]."

# --- Кому слать: администраторы с привязанным личным чатом ---
chats="$(docker exec self-hosting-db-1 psql -U postgres -d postgres -tAc "
  SELECT DISTINCT b.chat_id
  FROM public.user_roles r
  JOIN public.profiles p ON p.id = r.user_id
  JOIN public.telegram_bot_chats b ON lower(b.telegram_username) = lower(p.telegram_username)
  WHERE r.role = 'admin' AND b.chat_id > 0;" 2>/dev/null)"

if [ -z "$chats" ]; then
  log "не нашёл ни одного администратора с привязанным чатом — отправлять некому"
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  log "--dry-run, отправки не будет. Получателей: $(printf '%s' "$chats" | wc -l). Сообщение:"
  printf '%s\n' "$msg"
  exit 0
fi

sent=0
while IFS= read -r chat; do
  [ -z "$chat" ] && continue
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${chat}" \
    --data-urlencode "text=${msg}")"
  if [ "$code" = "200" ]; then
    sent=$((sent+1))
  else
    log "Telegram вернул $code для чата ${chat}"
  fi
done <<< "$chats"

log "напоминание отправлено: вопросов ${count}, получателей ${sent}"
