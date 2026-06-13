#!/usr/bin/env bash
# Bootstrap VPS для переезда JTD.
# Одной командой готовит сервер к запуску Claude Code и стека.
#
# Использование (на свежем Ubuntu 22.04):
#   curl -fsSL https://raw.githubusercontent.com/AV-jtd/jtd/claude/modest-hawking-sfszra/self-hosting/migration-stream/scripts/bootstrap-vps.sh | bash
#   # или если репо уже склонирован:
#   bash /opt/jtd/self-hosting/migration-stream/scripts/bootstrap-vps.sh

set -euo pipefail

REPO_URL="https://github.com/AV-jtd/jtd.git"
REPO_DIR="/opt/jtd"
BRANCH="claude/modest-hawking-sfszra"

ok()   { echo "  ✓ $1"; }
step() { echo ""; echo "==> $1"; }

echo "================================================"
echo "  JTD VPS Bootstrap"
echo "  $(date)"
echo "================================================"

# ---------- 1. Системные зависимости ----------
step "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Базовые утилиты (всегда)
apt-get install -y -qq curl git ufw jq certbot postgresql-client awscli

# Docker — пропустить если уже установлен (избежать конфликта)
if command -v docker &>/dev/null; then
  ok "Docker уже установлен ($(docker --version | awk '{print $3}' | tr -d ,)) — пропускаем"
else
  apt-get install -y -qq docker.io
fi

# docker-compose — проверить v1 и v2
if docker compose version &>/dev/null; then
  ok "docker compose уже доступен — пропускаем"
elif command -v docker-compose &>/dev/null; then
  ok "docker-compose v1 найден — пропускаем"
else
  apt-get install -y -qq docker-compose-v2 || \
    apt-get install -y -qq docker-compose
fi

ok "Пакеты установлены"

# ---------- 2. Node.js 20 ----------
step "Node.js 20"
if ! node --version 2>/dev/null | grep -q "v20"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
ok "Node.js $(node --version)"

# ---------- 3. Claude Code ----------
step "Claude Code CLI"
if ! command -v claude &>/dev/null; then
  npm install -g @anthropic-ai/claude-code --silent
fi
ok "Claude Code $(claude --version 2>/dev/null || echo 'установлен')"

# ---------- 4. Docker ----------
step "Docker"
systemctl enable docker --now > /dev/null 2>&1
usermod -aG docker root 2>/dev/null || true
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)"

# ---------- 5. Firewall ----------
step "Firewall (ufw)"
ufw --force reset > /dev/null 2>&1
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null
ok "ufw: порты 22, 80, 443 открыты"

# ---------- 6. Тома под данные ----------
step "Каталоги для данных"
mkdir -p /data/postgres /data/storage
mkdir -p /mnt/backup-disk/jtd
ok "/data/postgres, /data/storage, /mnt/backup-disk/jtd созданы"

# ---------- 7. Репозиторий ----------
step "Репозиторий JTD"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch origin
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" pull origin "$BRANCH"
  ok "Репозиторий обновлён: $REPO_DIR"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  ok "Репозиторий склонирован: $REPO_DIR"
fi

# Права на скрипты
chmod +x "$REPO_DIR"/self-hosting/backup/*.sh
chmod +x "$REPO_DIR"/self-hosting/storage/*.sh
chmod +x "$REPO_DIR"/self-hosting/migration-stream/scripts/*.sh

# ---------- 8. Preflight-проверка ----------
step "Preflight-проверка"
bash "$REPO_DIR/self-hosting/migration-stream/scripts/preflight-check.sh" || true

# ---------- Готово ----------
echo ""
echo "================================================"
echo "  Bootstrap завершён!"
echo "================================================"
echo ""
echo "Следующий шаг — авторизоваться и запустить Claude Code:"
echo ""
echo "  cd $REPO_DIR"
echo "  claude"
echo ""
echo "При первом запуске введи API-ключ Anthropic (https://console.anthropic.com)"
echo "Затем вставь промпт из HANDOFF-PROMPT.md — и Claude возьмёт управление."
echo ""
echo "Расположение файлов:"
echo "  Репозиторий:  $REPO_DIR"
echo "  Бэкапы:       /mnt/backup-disk/jtd"
echo "  Данные БД:    /data/postgres"
