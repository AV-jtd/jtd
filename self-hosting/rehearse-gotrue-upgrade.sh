#!/usr/bin/env bash
# Репетиция обновления GoTrue на КОПИИ базы. Прод не трогается.
#
# Зачем. GoTrue при старте применяет свои миграции к схеме auth, отката нет, а
# схема auth — это все входы в систему. Поэтому обновление сначала
# прогоняется на копии.
#
# Что делает: поднимает отдельные контейнеры базы и GoTrue в своей сети,
# восстанавливает в них свежий дамп, применяет миграции новой версии и даёт
# стенд для проверок. Ничего не публикует наружу.
#
# Запуск:   bash self-hosting/rehearse-gotrue-upgrade.sh [версия]
# Удалить:  bash self-hosting/rehearse-gotrue-upgrade.sh --down
#
# ВАЖНО: стенд держит полную копию рабочих данных. Удаляйте его после проверок.
#
# --- Грабли, найденные 27.09.2026 при первой репетиции ---------------------
# Всё это следствие того, что штатный дамп снимается с --no-acl: владение и
# права в копию не попадают. При настоящем восстановлении из наших копий будет
# то же самое, и GoTrue не поднимется. См. журнал, запись за 27.09.
#
# 1. Восстанавливать надо в ПУСТУЮ базу. Образ supabase/postgres создаёт схему
#    auth сам, и дамп упирается в конфликты: auth.users остаётся пустым, а
#    ошибки выглядят безобидно ("already exists").
# 2. Роль supabase_auth_admin в новом контейнере БЕЗ ПАРОЛЯ. Проверять это
#    надо по сети: локально pg_hba стоит trust, и проверка проходит, ничего не
#    проверив. Менять пароль может только supabase_admin — postgres здесь не
#    суперпользователь.
# 3. Объекты схемы auth принадлежат postgres, а не supabase_auth_admin.
#    GoTrue ищет свою таблицу миграций через information_schema, а та
#    показывает лишь то, на что у роли есть права: он её не видит, пытается
#    создать и падает на "already exists". Передавать владение надо не только
#    таблицами, но и ТИПАМИ (иначе миграция factor_type упадёт на "must be
#    owner of type") и функциями.

set -uo pipefail

REPO_DIR="/opt/jtd"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
NET=jtd-rehearsal
DB=jtd-rehearsal-db
AUTH=jtd-rehearsal-auth
DBNAME=rehearsal
PG_IMAGE=supabase/postgres:15.8.1.060
VERSION="${1:-v2.197.0}"
WORK=/tmp/jtd-rehearsal

log() { echo "==> $1"; }

if [ "${1:-}" = "--down" ]; then
  log "Удаляю стенд"
  docker rm -f "$AUTH" "$DB" >/dev/null 2>&1
  docker network rm "$NET" >/dev/null 2>&1
  rm -rf "$WORK"
  log "Готово. Дамп в каталоге копий не тронут."
  exit 0
fi

cd "$REPO_DIR" || exit 1
mkdir -p "$WORK"
PW="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD не найден"; exit 1; }

# ---------- 1. Свежий дамп ----------
# pg_dump из контейнера pg-backup: встроенный в supabase/postgres падает.
log "Свежий дамп"
VOL=/var/lib/docker/volumes/self-hosting_backup_data/_data
DUMP="$VOL/pre-gotrue-upgrade_$(date +%Y%m%d_%H%M%S).dump"
PGPASSWORD="$PW" docker exec -e PGPASSWORD self-hosting-pg-backup-1 \
  pg_dump -h db -U postgres -Fc --no-acl postgres > "$DUMP"
docker exec -i self-hosting-pg-backup-1 pg_restore --list < "$DUMP" > /dev/null \
  || { echo "дамп невалиден"; exit 1; }
log "  $(du -h "$DUMP" | cut -f1), проверен"

# ---------- 2. Контейнер базы ----------
log "Поднимаю копию базы"
docker network create "$NET" >/dev/null 2>&1
docker rm -f "$DB" "$AUTH" >/dev/null 2>&1
docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD="$PW" "$PG_IMAGE" >/dev/null
until docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1; do sleep 3; done

log "Восстанавливаю в пустую базу $DBNAME"
docker exec "$DB" psql -U postgres -c "CREATE DATABASE $DBNAME;" >/dev/null
docker exec -i "$DB" pg_restore -U postgres -d "$DBNAME" --no-owner --no-acl < "$DUMP" 2>"$WORK/restore.log"
log "  ошибок восстановления: $(grep -c '^pg_restore: error' "$WORK/restore.log" || true) (ожидаются только отсутствующие расширения)"
docker exec "$DB" psql -U postgres -d "$DBNAME" -At -c \
  "SELECT '  пользователей: ' || count(*) FROM auth.users;"

# ---------- 3. Права, которых нет в дампе ----------
log "Восстанавливаю владение (в дампе его нет, см. шапку)"
docker exec -e PGPASSWORD="$PW" "$DB" psql -h 127.0.0.1 -U supabase_admin -d postgres -q -c \
  "ALTER ROLE supabase_auth_admin WITH PASSWORD '$PW';"
docker exec -e PGPASSWORD="$PW" "$DB" psql -h 127.0.0.1 -U supabase_admin -d "$DBNAME" -q -c "
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
DO \$\$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='auth' AND c.relkind IN ('r','v') LOOP
    IF r.relkind='r' THEN EXECUTE format('ALTER TABLE auth.%I OWNER TO supabase_auth_admin', r.relname);
    ELSE EXECUTE format('ALTER VIEW auth.%I OWNER TO supabase_auth_admin', r.relname);
    END IF;
  END LOOP;
  -- Типы обязательны: без них падает миграция factor_type.
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
           WHERE n.nspname='auth' AND t.typtype IN ('e','c','d')
             AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype=t.oid AND c.relkind<>'c') LOOP
    EXECUTE format('ALTER TYPE auth.%I OWNER TO supabase_auth_admin', r.typname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='auth' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', r.sig);
  END LOOP;
  EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin';
END \$\$;"

# ---------- 4. GoTrue новой версии ----------
log "Окружение как у боевого, но адрес базы — копии"
docker inspect self-hosting-auth-1 --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(GOTRUE_|API_EXTERNAL|PORT=)' > "$WORK/auth.env.raw"
python3 - "$WORK/auth.env.raw" "$WORK/auth.env" "$DB" "$DBNAME" <<'PY'
import re, sys, io
src, dst, host, dbname = sys.argv[1:5]
out = []
for line in io.open(src, encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("GOTRUE_DB_DATABASE_URL="):
        v = line.split("=", 1)[1]
        v = re.sub(r"@[^/]+/", "@%s:5432/" % host, v)
        v = re.sub(r"/[A-Za-z0-9_]+(\?|$)", r"/%s\1" % dbname, v)
        line = "GOTRUE_DB_DATABASE_URL=" + v
    out.append(line)
out += [
    "GOTRUE_OAUTH_SERVER_ENABLED=true",
    "GOTRUE_OAUTH_SERVER_ALLOW_DYNAMIC_REGISTRATION=true",
    "GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH=/.lovable/oauth/consent",
]
io.open(dst, "w", encoding="utf-8").write("\n".join(out) + "\n")
PY

log "Запускаю GoTrue $VERSION"
docker run -d --name "$AUTH" --network "$NET" --env-file "$WORK/auth.env" "supabase/gotrue:$VERSION" >/dev/null
until docker logs "$AUTH" 2>&1 | grep -qiE 'API started|fatal'; do sleep 2; done
sleep 4
if docker logs "$AUTH" 2>&1 | grep -qi fatal; then
  echo "СТАРТ НЕ УДАЛСЯ:"; docker logs "$AUTH" 2>&1 | grep -i fatal | tail -3; exit 1
fi
docker exec "$DB" psql -U postgres -d "$DBNAME" -At -c \
  "SELECT '  миграций в auth: ' || count(*) || ', последняя ' || max(version) FROM auth.schema_migrations;"

cat <<EOS

Стенд готов. Проверять так (из контейнера в той же сети):

  ANON=\$(grep '^ANON_KEY=' $ENV_FILE | cut -d= -f2-)
  docker run --rm --network $NET curlimages/curl:latest -s -H "apikey: \$ANON" \\
    http://$AUTH:9999/.well-known/oauth-authorization-server

Удалить стенд (он держит копию рабочих данных):
  bash self-hosting/rehearse-gotrue-upgrade.sh --down
EOS
