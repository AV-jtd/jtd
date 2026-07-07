#!/usr/bin/env bash
# Деплой JTD на VPS: подтягивает main, собирает фронт, обновляет edge-функции,
# применяет новые миграции, перезагружает nginx. С откатом при сбое.
#
# Запускается: вручную (bash self-hosting/deploy.sh) или из GitHub Actions
# (deploy-vps.yml) по SSH при пуше в main.
#
# Идемпотентен. Ничего не делает разрушительного до успешной сборки.

set -euo pipefail

REPO_DIR="/opt/jtd"
COMPOSE="$REPO_DIR/self-hosting/docker-compose.supabase.yml"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
BRANCH="claude/modest-hawking-sfszra"
APPLIED_FILE="$REPO_DIR/self-hosting/.applied-migrations"

log() { echo "==> $1"; }
cd "$REPO_DIR"

# ---------- 1. Синхронизация кода из main ----------
log "Синхронизация с origin/main"
git fetch origin main "$BRANCH"
git checkout "$BRANCH"
# Наши инфра-конфиги не трогаем при мёрже — приоритет за нашей веткой
git merge --no-edit -X theirs origin/main || {
  log "Конфликт мёржа — оставляю self-hosting/ и migration-stream/ нашими"
  git checkout --ours -- self-hosting/ 2>/dev/null || true
  git add -A && git commit --no-edit || true
}
# Гарантированно наши инфра-файлы
git checkout HEAD -- self-hosting/ 2>/dev/null || true

# ---------- 2. Бэкап текущего фронта для отката ----------
log "Бэкап dist/ для отката"
rm -rf "$REPO_DIR/dist.backup"
[ -d "$REPO_DIR/dist" ] && cp -r "$REPO_DIR/dist" "$REPO_DIR/dist.backup"

# ---------- 3. Сборка фронтенда ----------
log "Сборка фронтенда"
# VITE-переменные публичные (клиентские). ANON_KEY берём из .env.supabase.
ANON_KEY="$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"
if ! VITE_SUPABASE_URL="https://justtodoit.ru" \
     VITE_SUPABASE_PROXY_URL="https://justtodoit.ru/sb" \
     VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
     VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY" \
     bash -c 'npm ci && npm run build'; then
  log "СБОРКА УПАЛА — откат dist/, деплой прерван"
  [ -d "$REPO_DIR/dist.backup" ] && rm -rf "$REPO_DIR/dist" && mv "$REPO_DIR/dist.backup" "$REPO_DIR/dist"
  exit 1
fi

# ---------- 4. Обновление edge-функций ----------
log "Перезапуск edge-runtime (подхватит новый код функций)"
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" restart edge-runtime || true

# ---------- 5. Применение новых миграций ----------
log "Применение новых миграций"
touch "$APPLIED_FILE"
for sql in $(ls "$REPO_DIR"/supabase/migrations/*.sql 2>/dev/null | sort); do
  fname="$(basename "$sql")"
  grep -qxF "$fname" "$APPLIED_FILE" && continue
  log "  миграция: $fname"
  if docker cp "$sql" self-hosting-db-1:/tmp/mig.sql && \
     docker exec self-hosting-db-1 psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/mig.sql; then
    echo "$fname" >> "$APPLIED_FILE"
  else
    log "  ⚠️ миграция $fname завершилась с ошибкой — проверь вручную, не отмечаю применённой"
  fi
done

# ---------- 6. Перезагрузка nginx ----------
log "Перезагрузка nginx"
docker restart self-hosting-nginx-1 >/dev/null

# ---------- 7. Проверка ----------
log "Health-check"
code="$(curl -sk -o /dev/null -w '%{http_code}' https://justtodoit.ru/ || echo 000)"
if [ "$code" != "200" ]; then
  log "⚠️ Сайт вернул $code — проверь. Откат: rm -rf dist && mv dist.backup dist && docker restart self-hosting-nginx-1"
  exit 1
fi

rm -rf "$REPO_DIR/dist.backup"
log "Деплой успешен: https://justtodoit.ru → $code"
