#!/usr/bin/env bash
# Учебное восстановление: поднимает базу из копии на отдельном стенде и
# проверяет, что в неё можно ВОЙТИ и прочитать данные через API. Прод не
# трогается: свои контейнеры, своя сеть, наружу ничего не публикуется.
#
# Зачем. 27.09.2026 выяснилось, что копии годами проверялись до «данные на
# месте», а вход после восстановления не поднимался (JOURNAL.md). Проверка
# «до входа» — единственная, которая это ловит.
#
# Запуск:
#   bash restore-drill.sh                  последняя ежедневная копия
#   bash restore-drill.sh <db_*.dump>      конкретная копия
#   bash restore-drill.sh ... --keep       не удалять стенд после проверки
#   bash restore-drill.sh --down           удалить стенд
#
# Успех: GoTrue стартовал на восстановленной базе, временный пользователь
# вошёл по паролю, PostgREST с его токеном отдал строки profiles.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.supabase"
ROLES_INIT="$SCRIPT_DIR/../db-init/service-roles.sql"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
NET=jtd-drill
DB=jtd-drill-db
AUTH=jtd-drill-auth
REST=jtd-drill-rest
WORK=/tmp/jtd-drill-env
PG_IMAGE=$(docker inspect self-hosting-db-1 -f '{{.Config.Image}}')
CURL="docker run --rm --network $NET curlimages/curl:latest -s"

log() { echo "==> $*"; }
down() {
  docker rm -f "$REST" "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$WORK"
}

DUMP=""; KEEP=false
for a in "$@"; do
  case "$a" in
    --down) down; echo "Стенд удалён."; exit 0 ;;
    --keep) KEEP=true ;;
    *) DUMP="$a" ;;
  esac
done
[ -n "$DUMP" ] || DUMP=$(ls -t "$BACKUP_DIR/daily/"db_*.dump 2>/dev/null | head -1)
[ -f "$DUMP" ] || { echo "Копия не найдена: '$DUMP'"; exit 1; }

PW="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
SERVICE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$PW" ] && [ -n "$SERVICE_KEY" ] || { echo "Нет ключей в $ENV_FILE"; exit 1; }

down
mkdir -p "$WORK" && chmod 700 "$WORK"
$KEEP || trap down EXIT

# ---------- 1. Пустая база, как на новом сервере ----------
log "Новый контейнер базы ($PG_IMAGE), service-roles.sql подключён как в compose"
docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$PW" \
  -v "$ROLES_INIT":/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro \
  "$PG_IMAGE" >/dev/null
for i in $(seq 100); do
  docker logs "$DB" 2>&1 | grep -q "init process complete" && break
  docker ps -q --filter "name=^$DB$" --filter status=running | grep -q . \
    || { echo "Инициализация базы упала:"; docker logs "$DB" 2>&1 | grep -i error | tail -5; exit 1; }
  sleep 3
done
until docker exec "$DB" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done

# ---------- 2. Восстановление штатным скриптом ----------
bash "$SCRIPT_DIR/restore.sh" "$DUMP" --container "$DB" --network "$NET" --yes \
  || { echo "restore.sh не прошёл"; exit 1; }

# ---------- 3. GoTrue и PostgREST боевых версий, адрес базы — стенда ----------
# Окружение берётся у боевых контейнеров и в вывод не попадает.
swap_db() {  # $1 — имя переменной с адресом базы
  python3 -c '
import re, sys
key, host = sys.argv[1], sys.argv[2]
for line in sys.stdin:
    if line.startswith(key + "="):
        line = re.sub(r"@[^/:]+(:\d+)?/", "@%s:5432/" % host, line)
    sys.stdout.write(line)' "$1" "$DB"
}
docker inspect self-hosting-auth-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(GOTRUE_|API_EXTERNAL|PORT=)' | swap_db GOTRUE_DB_DATABASE_URL > "$WORK/auth.env"
docker inspect self-hosting-rest-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^PGRST_' | swap_db PGRST_DB_URI > "$WORK/rest.env"

log "GoTrue $(docker inspect self-hosting-auth-1 -f '{{.Config.Image}}')"
docker run -d --name "$AUTH" --network "$NET" --env-file "$WORK/auth.env" \
  "$(docker inspect self-hosting-auth-1 -f '{{.Config.Image}}')" >/dev/null
for i in $(seq 60); do
  docker logs "$AUTH" 2>&1 | grep -qiE 'API started|fatal' && break; sleep 2
done
if docker logs "$AUTH" 2>&1 | grep -qi fatal; then
  echo "GoTrue НЕ СТАРТОВАЛ:"; docker logs "$AUTH" 2>&1 | grep -i fatal | tail -3; exit 1
fi
echo "  стартовал, миграции применились"

log "PostgREST $(docker inspect self-hosting-rest-1 -f '{{.Config.Image}}')"
docker run -d --name "$REST" --network "$NET" --env-file "$WORK/rest.env" \
  "$(docker inspect self-hosting-rest-1 -f '{{.Config.Image}}')" >/dev/null
sleep 5

# ---------- 4. Вход и чтение данных ----------
EMAIL="drill-$(date +%s)@drill.invalid"
PASS="Drill-$(openssl rand -hex 12)"
log "Временный пользователь на стенде: $EMAIL"
CODE=$($CURL -o /dev/null -w '%{http_code}' -X POST "http://$AUTH:9999/admin/users" \
  -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"email_confirm\":true}")
echo "  создание: HTTP $CODE"

TOKEN=$($CURL -X POST "http://$AUTH:9999/token?grant_type=password" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "ВХОД НЕ УДАЛСЯ"; exit 1; fi
echo "  вход по паролю: токен получен"

RESP=$($CURL -w '\n%{http_code}' "http://$REST:3000/profiles?select=id&limit=5" \
  -H "Authorization: Bearer $TOKEN")
CODE=$(echo "$RESP" | tail -1)
ROWS=$(echo "$RESP" | sed '$d' | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' 2>/dev/null || echo "?")
echo "  PostgREST /profiles с токеном: HTTP $CODE, строк $ROWS"
[ "$CODE" = 200 ] && [ "$ROWS" != "?" ] && [ "$ROWS" -gt 0 ] || { echo "ЧТЕНИЕ ДАННЫХ НЕ УДАЛОСЬ: $(echo "$RESP" | sed '$d' | cut -c1-200)"; exit 1; }

echo
echo "УЧЕНИЯ ПРОЙДЕНЫ: копия $(basename "$DUMP") восстанавливается до входа и чтения данных."
$KEEP && echo "Стенд оставлен. Удалить: bash $0 --down  (держит копию рабочих данных)"
exit 0
