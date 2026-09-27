#!/usr/bin/env bash
# Восстановление базы из дампа — так, чтобы после него работал ВХОД, а не
# только «данные на месте».
#
# Использование:
#   ./restore.sh <db_*.dump>            восстановить боевую базу (спросит подтверждение)
#   ./restore.sh --latest               последний ежедневный дамп
#   ./restore.sh --list                 показать доступные дампы
#
# Для учений (restore-drill.sh), без вопросов и без остановки служб:
#   ./restore.sh <dump> --container ИМЯ --network СЕТЬ --yes
#
# Как устроено и почему (всё проверено учебным восстановлением 27.09.2026,
# см. JOURNAL.md):
#   1. Роли — из roles_*.sql рядом с дампом: они живут на уровне кластера и в
#      pg_dump не попадают. Пароли служебным ролям — из db-init/service-roles.sql.
#   2. Текущая база НЕ удаляется, а переименовывается в postgres_before_<время>:
#      откат — переименовать обратно. Удалить её после проверки вручную.
#   3. pg_restore --create от supabase_admin, БЕЗ --no-owner и --no-acl: владение
#      схемой auth нужно GoTrue, права — PostgREST. Восстанавливается база
#      с именем postgres, иначе не создастся pg_cron.
#   4. Клиентские утилиты — из postgres:15-alpine: pg_dump в образе
#      supabase/postgres падает с segfault (см. backup.sh).
#
# Переменные: BACKUP_DIR (default /var/backups/jtd)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.supabase"
ROLES_INIT="$SCRIPT_DIR/../db-init/service-roles.sql"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/jtd}"
CLIENT_IMAGE="postgres:15-alpine"

TARGET="self-hosting-db-1"
NETWORK="self-hosting_default"
ASSUME_YES=false
PROD=true
DUMP_FILE=""

# Службы, которые держат соединения с базой. Останавливаются на время
# восстановления боевой базы.
SERVICES="self-hosting-auth-1 self-hosting-rest-1 self-hosting-storage-1 self-hosting-realtime-1 self-hosting-edge-runtime-1 self-hosting-meta-1 self-hosting-pg-backup-1"

while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      for d in daily weekly monthly; do
        echo "== $d"; ls -lht "${BACKUP_DIR}/$d/"*.dump 2>/dev/null | head -7 || echo "  нет"
      done
      exit 0 ;;
    --latest)
      DUMP_FILE=$(ls -t "${BACKUP_DIR}/daily/"db_*.dump 2>/dev/null | head -1) ;;
    --container) TARGET="$2"; PROD=false; shift ;;
    --network)   NETWORK="$2"; shift ;;
    --yes)       ASSUME_YES=true ;;
    *)           DUMP_FILE="$1" ;;
  esac
  shift
done

[ -n "$DUMP_FILE" ] && [ -f "$DUMP_FILE" ] || { echo "Дамп не найден: '${DUMP_FILE}'"; exit 1; }
DUMP_FILE="$(readlink -f "$DUMP_FILE")"
DUMP_DIR="$(dirname "$DUMP_FILE")"
# db_20260927_030001.dump -> roles_20260927_030001.sql (weekly/monthly — так же)
ROLES_FILE="$DUMP_DIR/$(basename "$DUMP_FILE" .dump | sed 's/^db_/roles_/').sql"

PW="$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)"
[ -n "$PW" ] || { echo "POSTGRES_PASSWORD не найден в $ENV_FILE"; exit 1; }

log() { echo "==> $*"; }
# Клиент в сети целевой базы; дамп и файлы ролей видны как /w и /init.
client() {
  docker run --rm -i --network "$NETWORK" \
    -e PGPASSWORD="$PW" -e POSTGRES_PASSWORD="$PW" -e PGOPTIONS="-c client_min_messages=warning" \
    -v "$DUMP_DIR":/w:ro -v "$(dirname "$ROLES_INIT")":/init:ro \
    "$CLIENT_IMAGE" "$@"
}
sql() { client psql -h "$TARGET" -U supabase_admin -d "${2:-template1}" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

echo "Дамп:      $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
echo "Роли:      $([ -f "$ROLES_FILE" ] && echo "$ROLES_FILE" || echo 'НЕТ — дамп снят до 27.09.2026')"
echo "База:      $TARGET (сеть $NETWORK)"

log "Проверяю дамп"
client pg_restore --list "/w/$(basename "$DUMP_FILE")" > /tmp/restore-list.$$ || { echo "дамп невалиден"; exit 1; }
ACL_COUNT=$(grep -c ' ACL ' /tmp/restore-list.$$ || true)
rm -f /tmp/restore-list.$$
echo "  записей прав (ACL): $ACL_COUNT"
if [ "$ACL_COUNT" -eq 0 ]; then
  echo "  ВНИМАНИЕ: дамп снят с --no-acl (до 27.09.2026). Права восстановятся"
  echo "  только общим скриптом grants-fallback.sql — см. JOURNAL.md."
fi

if $PROD && ! $ASSUME_YES; then
  echo
  echo "Боевая база будет ЗАМЕНЕНА. Текущая сохранится под другим именем."
  read -r -p "Введите 'ВОССТАНОВИТЬ' для подтверждения: " CONFIRM
  [ "$CONFIRM" = "ВОССТАНОВИТЬ" ] || { echo "Отменено."; exit 0; }
fi

if $PROD; then
  log "Останавливаю службы"
  docker stop $SERVICES >/dev/null
  # Что бы ни случилось дальше, службы поднимутся обратно.
  trap 'docker start $SERVICES >/dev/null' EXIT
fi

if [ -f "$ROLES_FILE" ]; then
  log "Роли (существующие дадут 'already exists' — это нормально)"
  client psql -h "$TARGET" -U supabase_admin -d template1 -q \
    -f "/w/$(basename "$ROLES_FILE")" 2>&1 | grep -v 'already exists' || true
fi

log "Пароли служебных ролей (db-init/service-roles.sql)"
client psql -h "$TARGET" -U supabase_admin -d template1 -q -v ON_ERROR_STOP=1 -f /init/service-roles.sql >/dev/null

OLD_DB="postgres_before_$(date +%Y%m%d_%H%M%S)"
log "Откладываю текущую базу как $OLD_DB"
# pg_cron переподключается сам — отсекаем соединения и переименовываем сразу.
for i in 1 2 3 4 5; do
  if sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid<>pg_backend_pid();
          ALTER DATABASE postgres RENAME TO $OLD_DB;" >/dev/null 2>&1; then
    break
  fi
  [ "$i" = 5 ] && { echo "Не удалось переименовать базу: держат соединения"; exit 1; }
  sleep 1
done

log "Восстанавливаю (обычно 30 секунд)"
LOG_FILE="$(mktemp /tmp/restore-log.XXXXXX)"
client pg_restore -h "$TARGET" -U supabase_admin -d template1 --create \
  "/w/$(basename "$DUMP_FILE")" > "$LOG_FILE" 2>&1 || true
ERRORS=$(grep -c '^pg_restore: error' "$LOG_FILE" || true)
echo "  ошибок: $ERRORS (полный журнал: $LOG_FILE)"
grep '^pg_restore: error' "$LOG_FILE" | cut -c1-160 | sort | uniq -c | sort -rn | head -15

if [ "$ACL_COUNT" -eq 0 ]; then
  log "Общие права для дампа без ACL"
  client psql -h "$TARGET" -U supabase_admin -d postgres -q -f /init/grants-fallback.sql 2>&1 \
    | { grep -c "ERROR" || true; } | sed "s/^/  операторов с ошибкой (объекта нет в этой копии): /"
fi

log "Перезапускаю базу (pg_cron подхватит восстановленную базу)"
docker restart "$TARGET" >/dev/null
until docker exec "$TARGET" pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done
sleep 3

# Секреты vault зашифрованы корневым ключом pgsodium. Он хранится в контейнере
# базы, а не в дампе, поэтому на новом контейнере восстановленные секреты не
# расшифровываются — и падает любая вставка в auth.users (триггер регистрации
# читает vault). Оба секрета выводятся из .env.supabase: создаём заново.
log "Секреты vault"
DB="$TARGET" bash "$SCRIPT_DIR/../fix-vault-secrets.sh" >/dev/null

log "Проверки"
FAIL=0
# По сети, с паролем: локально pg_hba стоит trust и проверка ничего не докажет.
for r in supabase_auth_admin authenticator supabase_storage_admin; do
  if client psql -h "$TARGET" -U "$r" -d postgres -tAc "select 1" >/dev/null 2>&1; then
    echo "  вход $r: да"
  else
    echo "  вход $r: НЕТ"; FAIL=1
  fi
done
# Именно так GoTrue ищет свою таблицу миграций. Было 0 при восстановлении с --no-owner.
AUTH_TABLES=$(client psql -h "$TARGET" -U supabase_auth_admin -d postgres -tAc \
  "select count(*) from information_schema.tables where table_schema='auth'")
echo "  таблиц auth, видимых supabase_auth_admin: $AUTH_TABLES"
[ "$AUTH_TABLES" -gt 0 ] || FAIL=1
VAULT_OK=$(sql "select count(*) from vault.decrypted_secrets where decrypted_secret is not null" postgres 2>/dev/null || echo 0)
echo "  секретов vault расшифровывается: $VAULT_OK"
[ "$VAULT_OK" -ge 2 ] || FAIL=1
sql "select '  пользователей: '||(select count(*) from auth.users)||', задач: '||(select count(*) from public.tasks)||', профилей: '||(select count(*) from public.profiles)||', заданий cron: '||(select count(*) from cron.job)" postgres

$PROD && log "Службы запустятся при выходе"

echo
if [ "$FAIL" = 0 ]; then
  echo "Готово. Прежняя база сохранена как $OLD_DB."
  echo "Откат: остановить службы, переименовать postgres -> другое имя, $OLD_DB -> postgres."
  echo "Когда всё проверено: DROP DATABASE $OLD_DB;  (от supabase_admin)"
else
  echo "ПРОВЕРКИ НЕ ПРОШЛИ — см. выше. Прежняя база: $OLD_DB."
  exit 1
fi
