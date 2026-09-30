#!/usr/bin/env bash
# Деплой JTD на VPS: подтягивает main, собирает фронт, обновляет edge-функции,
# применяет новые миграции, перезагружает nginx. С откатом при сбое.
#
# Запускается: вручную (bash self-hosting/deploy.sh) или из GitHub Actions
# (deploy-vps.yml) по SSH при пуше в main.
#
# Идемпотентен. Ничего не делает разрушительного до успешной сборки.

set -euo pipefail

# ---------- 0. Работать с копии самого себя ----------
# Bash читает скрипт по ходу исполнения, по смещению в файле. Ниже деплой
# сливает свежий код и делает `git checkout HEAD -- self-hosting/`, то есть
# может заменить этот самый файл под работающим интерпретатором — и тот
# продолжит со старого смещения посреди чужой строки (бэклог P4, 27.09.2026).
# Поэтому сразу уходим в копию во /tmp: текущий прогон идёт по версии, с
# которой начался, а новая версия действует со следующего деплоя.
if [ -z "${JTD_DEPLOY_COPY:-}" ]; then
  JTD_DEPLOY_COPY="$(mktemp /tmp/jtd-deploy.XXXXXX.sh)"
  cp "$0" "$JTD_DEPLOY_COPY"
  export JTD_DEPLOY_COPY
  exec bash "$JTD_DEPLOY_COPY" "$@"
fi
trap 'rm -f "$JTD_DEPLOY_COPY"' EXIT

REPO_DIR="/opt/jtd"
COMPOSE="$REPO_DIR/self-hosting/docker-compose.supabase.yml"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
BRANCH="claude/modest-hawking-sfszra"
APPLIED_FILE="$REPO_DIR/self-hosting/.applied-migrations"

log() { echo "==> $1"; }

# Сообщение администраторам в Telegram. Красный прогон в Actions заметит не
# каждый и не сразу, а сообщение в личку — заметят. Получатели берутся из базы,
# а не зашиты, чтобы список не устарел при смене состава.
# Молчит и возвращает успех, если что-то недоступно: уведомление не должно
# ломать деплой.
notify_admins() {
  local text="$1" token chats
  token="$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)"
  [ -z "$token" ] && return 0
  chats="$(docker exec self-hosting-db-1 psql -U postgres -tAc "
    SELECT DISTINCT b.chat_id
    FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    JOIN public.telegram_bot_chats b ON lower(b.telegram_username) = lower(p.telegram_username)
    WHERE r.role = 'admin' AND b.chat_id > 0;" 2>/dev/null)" || return 0
  while IFS= read -r chat; do
    [ -z "$chat" ] && continue
    curl -s -o /dev/null --max-time 15 \
      "https://api.telegram.org/bot${token}/sendMessage" \
      --data-urlencode "chat_id=${chat}" --data-urlencode "text=${text}" || true
  done <<< "$chats"
  return 0
}
cd "$REPO_DIR"

# ---------- 0б. Рабочий каталог должен быть чистым ----------
# Деплой собирает прод из /opt/jtd — того же каталога, где работает сессия
# Claude на сервере. 30.09.2026 слияние PR пришлось на середину работы, и на
# прод уехали незакоммиченные правки дашборда и неотслеживаемая миграция
# (журнал, 30.09). Незаконченное не выкатываем: останавливаемся и сообщаем.
# Исключения — файлы, которые меняет сам деплой: отметки миграций и артефакт
# MCP, который сборка перегенерирует из src/lib/mcp.
dirty="$(git status --porcelain --untracked-files=normal \
  | grep -vE '^.. (self-hosting/\.applied-migrations|supabase/functions/mcp/index\.ts)$' || true)"
if [ -n "$dirty" ]; then
  log "В рабочем каталоге незакоммиченные изменения — деплой остановлен, прод не тронут:"
  printf '%s\n' "$dirty" | head -20
  notify_admins "⏸ Деплой JustTODOit отложен: на сервере есть незакоммиченная работа ($(printf '%s\n' "$dirty" | wc -l) файлов). Прод не тронут. Деплой пройдёт при следующем слиянии в main — или запустите его вручную, когда работа будет закоммичена."
  exit 1
fi

# ---------- 1. Синхронизация кода ----------
log "Синхронизация с origin/$BRANCH и origin/main"
git fetch origin main "$BRANCH"
git checkout "$BRANCH"

# Сначала подтягиваем СВОЮ ветку с GitHub. Раньше этой строки не было: ветку
# скрипт забирал (git fetch), но сливал только origin/main. Из-за этого всё,
# что пушила вторая сессия Claude, на сервер автоматически не попадало никогда
# — только ручным git pull. За две недели на это наступили четыре раза:
# «скрипта нет в репозитории», хотя он был запушен.
git merge --no-edit origin/"$BRANCH" || {
  log "КОНФЛИКТ с origin/$BRANCH — деплой прерван, разберите вручную"
  git merge --abort 2>/dev/null || true
  exit 1
}

# Наши инфра-конфиги не трогаем при мёрже — приоритет за нашей веткой
git merge --no-edit -X theirs origin/main || {
  log "Конфликт мёржа — оставляю self-hosting/ и migration-stream/ нашими"
  git checkout --ours -- self-hosting/ 2>/dev/null || true
  git add -A && git commit --no-edit || true
}
# Гарантированно наши инфра-файлы
git checkout HEAD -- self-hosting/ 2>/dev/null || true

# ---------- 2. Сборка фронтенда (в temp, атомарная замена) ----------
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
# Шаги сборки вызываются по отдельности, а не `npm run build -- --outDir …`.
# С 30.09 сценарий build — «vite build && node scripts/build-assistant-function.mjs»,
# и npm передавал --outDir ПОСЛЕДНЕЙ команде: vite собирал прямо в dist, который
# отдаёт nginx (сайт пустел на время сборки), а деплой, не найдя
# dist.new/index.html, останавливался — без миграций и без перезапуска
# edge-функций (журнал, 30.09). Меняете сценарий build в package.json —
# повторите шаги здесь.
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
     bash -c 'install_deps && npx vite build --outDir dist.new && node scripts/build-assistant-function.mjs'; then
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
# ---------- 3. Миграции: ДО того, как тронут прод ----------
# Порядок важен, и он изменён 27.09.2026. Раньше миграции применялись ПОСЛЕ
# подмены dist и перезапуска edge-runtime, а ошибку скрипт проглатывал: писал
# предупреждение и завершался успешно. Из-за этого миграция
# 20260912170000_shared_pages_hardening пролежала неприменённой пятнадцать дней,
# и приватные страницы всё это время не работали — никто не знал.
#
# Теперь миграции идут когда сборка уже удалась, но прод ещё НЕ тронут. Любая
# неудача прерывает деплой: прод остаётся целиком на старой версии, а не в
# полусостоянии «новый фронтенд, старая схема».
log "Применение новых миграций (до подмены прода)"
touch "$APPLIED_FILE"
failed_migrations=""
for sql in $(ls "$REPO_DIR"/supabase/migrations/*.sql 2>/dev/null | sort); do
  fname="$(basename "$sql")"
  grep -qxF "$fname" "$APPLIED_FILE" && continue
  log "  миграция: $fname"
  if docker cp "$sql" self-hosting-db-1:/tmp/mig.sql && \
     docker exec self-hosting-db-1 psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/mig.sql; then
    echo "$fname" >> "$APPLIED_FILE"
  else
    failed_migrations="${failed_migrations}${fname} "
  fi
done

if [ -n "$failed_migrations" ]; then
  log "МИГРАЦИИ НЕ ПРИМЕНИЛИСЬ: $failed_migrations"
  log "Прод не тронут: dist прежний, edge-runtime не перезапускался, nginx не трогали."
  log "Разберитесь с миграцией и запустите деплой заново."
  rm -rf "$REPO_DIR/dist.new"
  notify_admins "⚠️ Деплой JustTODOit остановлен: не применились миграции — ${failed_migrations}. Прод остался на прежней версии, ничего не сломано. Нужен разбор."
  exit 1
fi

# ---------- 4. Атомарная подмена собранного фронтенда ----------
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

# ---------- 5. Обновление edge-функций ----------
log "Перезапуск edge-runtime (подхватит новый код функций)"
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" restart edge-runtime || true

# ---------- 6. Перезагрузка nginx ----------
log "Перезагрузка nginx"
docker restart self-hosting-nginx-1 >/dev/null

# ---------- 7. Проверка ----------
log "Health-check"
# С повторами: проверка шла сразу после `docker restart nginx`, и nginx ещё не
# принимал соединения. 30.09 так дважды «упали» деплои, которые на деле
# выкатились целиком (сайт отвечал 200 через секунду).
code=000
for _ in $(seq 15); do
  code="$(curl -sk -o /dev/null -w '%{http_code}' https://justtodoit.ru/ || echo 000)"
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" != "200" ]; then
  log "⚠️ Сайт вернул $code. dist/ обновлён атомарно (inode сохранён). Проверь: docker restart self-hosting-nginx-1; docker logs self-hosting-nginx-1 --tail 30"
  exit 1
fi

# Сверка на всякий случай: даже при успехе число файлов и число отметок должно
# совпадать. Расхождение означает, что миграцию применили руками и не отметили,
# либо отметили, не применив, — и то и другое однажды выстрелит.
files_n="$(ls "$REPO_DIR"/supabase/migrations/*.sql 2>/dev/null | wc -l)"
applied_n="$(grep -c . "$APPLIED_FILE" 2>/dev/null || echo 0)"
if [ "$files_n" -ne "$applied_n" ]; then
  log "⚠️ миграций в репозитории $files_n, отмечено применёнными $applied_n — расхождение"
  notify_admins "⚠️ Деплой JustTODOit прошёл, но миграций в репозитории ${files_n}, а отмечено применёнными ${applied_n}. Стоит проверить."
fi

log "Деплой завершён успешно (site $code)"
log "Деплой успешен: https://justtodoit.ru → $code"
