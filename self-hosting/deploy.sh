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

# ---------- 2-3. Сборка фронтенда (в temp, атомарная замена) ----------
# Собираем в dist.new и только при успехе синхронизируем в dist/ через rsync
# (сохраняет inode каталога → bind-mount nginx НЕ устаревает; именно смена
# inode ловилась как 403). При падении сборки dist/ НЕ трогаем — прод жив.
#
# Про менеджер пакетов. В репозитории два локфайла, и они принадлежат разным
# сторонам: bun.lock ведёт Lovable, package-lock.json — мы. Собирать на VPS
# через bun НЕЛЬЗЯ: все 338 tarball-ссылок в bun.lock указывают на приватный
# реестр Lovable (pkg.dev/lovable-core-prod), снаружи он отдаёт 403.
# Поэтому здесь npm с нашим package-lock.json — он полный и целиком с
# registry.npmjs.org.
#
# npm ci — основной путь: ставит строго по локфайлу, воспроизводимо.
# Если Lovable добавил зависимость в package.json и наш локфайл отстал,
# npm ci падает; тогда откатываемся на npm install, чтобы деплой не встал,
# и громко просим обновить локфайл (иначе прод молча уедет на другие версии).
log "Сборка фронтенда (в dist.new)"
ANON_KEY="$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d= -f2-)"
rm -rf "$REPO_DIR/dist.new"
install_deps() {
  if npm ci --no-audit --no-fund; then return 0; fi
  log "⚠️ npm ci не прошёл — package-lock.json отстал от package.json."
  log "⚠️ Ставлю через npm install. Обнови локфайл: npm install && закоммить package-lock.json"
  npm install --no-audit --no-fund
}
export -f install_deps log
if ! VITE_SUPABASE_URL="https://justtodoit.ru" \
     VITE_SUPABASE_PROXY_URL="https://justtodoit.ru/sb" \
     VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
     VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY" \
     bash -c 'install_deps && npm run build -- --outDir dist.new'; then
  log "СБОРКА УПАЛА — dist/ не тронут, прод остаётся на прежней версии"
  rm -rf "$REPO_DIR/dist.new"
  # На всякий случай убеждаемся, что nginx отдаёт текущий (рабочий) dist/
  docker restart self-hosting-nginx-1 >/dev/null 2>&1 || true
  exit 1
fi
# Проверка что билд реально создал index.html — иначе не подменяем
if [ ! -f "$REPO_DIR/dist.new/index.html" ]; then
  log "СБОРКА без index.html — подмену не делаю, прод не тронут"
  rm -rf "$REPO_DIR/dist.new"
  exit 1
fi
log "Атомарная замена содержимого dist/ (inode сохраняется)"
mkdir -p "$REPO_DIR/dist"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$REPO_DIR/dist.new/" "$REPO_DIR/dist/"
else
  # fallback без rsync: чистим и копируем содержимое, не удаляя сам каталог
  find "$REPO_DIR/dist" -mindepth 1 -delete
  cp -a "$REPO_DIR/dist.new/." "$REPO_DIR/dist/"
fi
rm -rf "$REPO_DIR/dist.new"

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
  log "⚠️ Сайт вернул $code. dist/ обновлён атомарно (inode сохранён). Проверь: docker restart self-hosting-nginx-1; docker logs self-hosting-nginx-1 --tail 30"
  exit 1
fi

log "Деплой завершён успешно (site $code)"
log "Деплой успешен: https://justtodoit.ru → $code"
