#!/usr/bin/env bash
# Сквозная проверка стека JTD. Только чтение — ничего не меняет и не чинит.
#
# Запуск:  bash /opt/jtd/self-hosting/healthcheck.sh
#
# Проверяет по порядку: контейнеры, диск, публичный сайт, маршруты Kong,
# админский эндпоинт авторизации (то место, где падала регистрация через
# бота), базу, задания pg_cron и их последние запуски, realtime, миграции,
# вебхук Telegram, резервные копии.
#
# Секреты (ключи, токены) читаются из .env.supabase и НИКОГДА не печатаются:
# в вывод идут только коды ответов и признаки «задано / не задано».

set -uo pipefail   # без -e: одна упавшая проверка не должна обрывать отчёт

REPO_DIR="/opt/jtd"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
COMPOSE="$REPO_DIR/self-hosting/docker-compose.supabase.yml"
SITE="https://justtodoit.ru"
KONG="http://localhost:8000"

fails=0
ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
bad()  { printf '  \033[31mСБОЙ\033[0m  %s\n' "$1"; fails=$((fails+1)); }
warn() { printf '  \033[33m?\033[0m     %s\n' "$1"; }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# Достаём ключи, не показывая их.
getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-; }
ANON_KEY="$(getenv ANON_KEY)"
SERVICE_KEY="$(getenv SERVICE_ROLE_KEY)"
BOT_TOKEN="$(getenv TELEGRAM_BOT_TOKEN)"
BACKUP_DIR="$(getenv BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-/backups}"

psql_q() { docker exec self-hosting-db-1 psql -U postgres -tAc "$1" 2>/dev/null; }

printf '\033[1mJTD healthcheck — %s\033[0m\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')"
printf 'Аптайм: %s\n' "$(uptime -p 2>/dev/null || uptime)"

# ---------- 1. Контейнеры ----------
head_ "1. Контейнеры"
EXPECTED=11
running="$(docker ps --filter 'name=self-hosting-' --format '{{.Names}}' | wc -l)"
[ "$running" -eq "$EXPECTED" ] && ok "$running/$EXPECTED запущено" || bad "$running/$EXPECTED запущено"
docker ps -a --filter 'name=self-hosting-' --format '{{.Names}}|{{.Status}}' | sort | while IFS='|' read -r n s; do
  case "$s" in
    Up*health*unhealthy*) printf '  \033[31m%-34s %s\033[0m\n' "$n" "$s" ;;
    Up*)                  printf '  %-34s %s\n' "$n" "$s" ;;
    *)                    printf '  \033[31m%-34s %s\033[0m\n' "$n" "$s" ;;
  esac
done
restarting="$(docker ps --filter 'name=self-hosting-' --filter 'status=restarting' --format '{{.Names}}')"
[ -z "$restarting" ] && ok "нет перезапускающихся" || bad "перезапускаются: $restarting"

# ---------- 2. Диск и память ----------
head_ "2. Ресурсы"
use="$(df -P / | awk 'NR==2{print $5}' | tr -d '%')"
[ "$use" -lt 85 ] && ok "диск / занят ${use}%" || bad "диск / занят ${use}% — мало места"
df -Ph /var/lib/docker 2>/dev/null | awk 'NR==2{printf "  docker: занято %s из %s\n",$3,$2}'
free -m | awk '/^Mem:/{printf "  память: занято %sМБ из %sМБ, свободно %sМБ\n",$3,$2,$7}'

# ---------- 3. Публичный сайт ----------
head_ "3. Сайт снаружи"
for path in "/" "/frameworks/"; do
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$path")"
  [ "$code" = "200" ] && ok "$path → $code" || bad "$path → $code"
done
code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 -H "apikey: $ANON_KEY" "$SITE/sb/auth/v1/health")"
[ "$code" = "200" ] && ok "/sb/auth/v1/health → $code" || bad "/sb/auth/v1/health → $code"

# ---------- 4. Kong: маршруты изнутри ----------
# Именно здесь падала регистрация: edge-функция ходит на kong:8000/auth/v1.
head_ "4. Kong (порт 8000)"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "apikey: $ANON_KEY" "$KONG/auth/v1/health")"
[ "$code" = "200" ] && ok "/auth/v1/health → $code" || bad "/auth/v1/health → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "apikey: $ANON_KEY" "$KONG/rest/v1/")"
[ "$code" = "200" ] && ok "/rest/v1/ → $code" || bad "/rest/v1/ → $code"

# Админский эндпоинт — ровно тот, на котором ломалась регистрация.
# GET, читающий список: ничего не создаёт.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  "$KONG/auth/v1/admin/users?page=1&per_page=1")"
[ "$code" = "200" ] && ok "/auth/v1/admin/users → $code (создание пользователей доступно)" \
                    || bad "/auth/v1/admin/users → $code (регистрация через бота будет падать)"

# ---------- 5. База ----------
head_ "5. База"
[ "$(psql_q 'SELECT 1')" = "1" ] && ok "psql отвечает" || bad "psql не отвечает"
printf '  пользователей в auth.users: %s\n' "$(psql_q 'SELECT count(*) FROM auth.users')"
printf '  профилей в profiles:        %s\n' "$(psql_q 'SELECT count(*) FROM public.profiles')"
orphans="$(psql_q 'SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL')"
[ "$orphans" = "0" ] && ok "нет пользователей без профиля" || warn "пользователей без профиля: $orphans"

# ---------- 6. pg_cron ----------
head_ "6. Задания pg_cron"
psql_q "SELECT jobname||' | '||schedule||' | '||CASE WHEN active THEN 'вкл' ELSE 'ВЫКЛ' END FROM cron.job ORDER BY jobname" \
  | while read -r l; do [ -n "$l" ] && printf '  %s\n' "$l"; done
inactive="$(psql_q "SELECT count(*) FROM cron.job WHERE NOT active")"
[ "$inactive" = "0" ] && ok "все задания включены" || warn "выключенных заданий: $inactive"
echo "  последние неуспешные запуски за 7 дней:"
bad_runs="$(psql_q "SELECT count(*) FROM cron.job_run_details WHERE status <> 'succeeded' AND start_time > now() - interval '7 days'")"
if [ "${bad_runs:-0}" = "0" ]; then
  ok "нет неуспешных запусков"
else
  bad "неуспешных запусков: $bad_runs"
  psql_q "SELECT '    '||jobid||' '||coalesce(status,'?')||' '||to_char(start_time,'DD.MM HH24:MI')||' '||left(coalesce(return_message,''),80) FROM cron.job_run_details WHERE status <> 'succeeded' AND start_time > now() - interval '7 days' ORDER BY start_time DESC LIMIT 5"
fi

# ---------- 7. Realtime ----------
head_ "7. Realtime"
tenants="$(psql_q "SELECT count(*) FROM _realtime.tenants" 2>/dev/null)"
[ -n "$tenants" ] && [ "$tenants" != "0" ] && ok "тенантов: $tenants" || bad "тенант realtime не найден"

# ---------- 8. Миграции ----------
head_ "8. Миграции"
files="$(ls "$REPO_DIR"/supabase/migrations/*.sql 2>/dev/null | wc -l)"
applied="$(wc -l < "$REPO_DIR/self-hosting/.applied-migrations" 2>/dev/null || echo 0)"
printf '  файлов: %s, отмечено применёнными: %s\n' "$files" "$applied"
[ "$files" -eq "$applied" ] && ok "расхождений нет" || warn "не отмечено применёнными: $((files-applied)) (норма, если миграции применялись вручную)"

# ---------- 9. Вебхук Telegram ----------
head_ "9. Вебхук Telegram"
if [ -n "$BOT_TOKEN" ]; then
  wh="$(curl -s --max-time 15 "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo")"
  url="$(printf '%s' "$wh" | grep -o '"url":"[^"]*"' | cut -d'"' -f4)"
  pending="$(printf '%s' "$wh" | grep -o '"pending_update_count":[0-9]*' | cut -d: -f2)"
  lasterr="$(printf '%s' "$wh" | grep -o '"last_error_message":"[^"]*"' | cut -d'"' -f4)"
  [ -n "$url" ] && ok "вебхук зарегистрирован: $url" || bad "вебхук НЕ зарегистрирован — бот не будет отвечать"
  [ "${pending:-0}" = "0" ] && ok "очередь пуста" || warn "необработанных апдейтов: $pending"
  [ -z "$lasterr" ] && ok "ошибок доставки нет" || bad "последняя ошибка: $lasterr"
else
  warn "TELEGRAM_BOT_TOKEN не задан в .env.supabase — проверка пропущена"
fi

# ---------- 10. Резервные копии ----------
head_ "10. Резервные копии"
last="$(docker exec self-hosting-pg-backup-1 sh -c "ls -t $BACKUP_DIR/*.gz $BACKUP_DIR/*/*.gz 2>/dev/null | head -1" 2>/dev/null)"
if [ -n "$last" ]; then
  info="$(docker exec self-hosting-pg-backup-1 sh -c "ls -l '$last'" 2>/dev/null | awk '{print $5" байт, "$6" "$7" "$8}')"
  ok "последняя копия: $(basename "$last") — $info"
else
  warn "копий не найдено в $BACKUP_DIR (проверьте вручную)"
fi

# ---------- 11. Постоянная сессия ----------
head_ "11. tmux-сессия"
systemctl is-enabled jtd-tmux.service >/dev/null 2>&1 \
  && ok "юнит jtd-tmux включён (сессия переживёт перезагрузку)" \
  || warn "юнит jtd-tmux не включён"

# ---------- Итог ----------
head_ "Итог"
[ "$fails" -eq 0 ] && printf '  \033[32mВсё в порядке\033[0m\n' \
                   || printf '  \033[31mПроблем: %s — см. строки СБОЙ выше\033[0m\n' "$fails"
exit 0
