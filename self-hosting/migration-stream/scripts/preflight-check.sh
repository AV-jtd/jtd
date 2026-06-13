#!/usr/bin/env bash
# Pre-flight проверка готовности VPS к развёртыванию (фаза 0).
# Использование: ./preflight-check.sh

set -uo pipefail

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }

echo "=== JTD Pre-flight Check (фаза 0) ==="
echo ""

# Docker
echo "[Docker]"
command -v docker &>/dev/null && ok "docker установлен ($(docker --version | awk '{print $3}' | tr -d ,))" || bad "docker не найден"
docker compose version &>/dev/null && ok "docker compose v2 доступен" || bad "docker compose v2 не найден"
docker info &>/dev/null && ok "docker daemon запущен" || bad "docker daemon недоступен"

# Утилиты
echo ""
echo "[Утилиты]"
command -v psql &>/dev/null && ok "psql (postgresql-client) установлен" || bad "psql не найден — нужен для миграции"
command -v aws &>/dev/null && ok "aws CLI установлен" || warn "aws CLI не найден — нужен для S3 (п.2)"
command -v certbot &>/dev/null && ok "certbot установлен" || warn "certbot не найден — нужен для SSL"
command -v git &>/dev/null && ok "git установлен" || bad "git не найден"

# Ресурсы
echo ""
echo "[Ресурсы]"
CPU=$(nproc)
[ "$CPU" -ge 4 ] && ok "CPU: ${CPU} ядер" || warn "CPU: ${CPU} ядер (рекомендуется ≥4)"

RAM_GB=$(free -g | awk '/^Mem:/{print $2}')
[ "$RAM_GB" -ge 7 ] && ok "RAM: ${RAM_GB} GB" || warn "RAM: ${RAM_GB} GB (рекомендуется ≥8)"

DISK_FREE=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
[ "$DISK_FREE" -ge 40 ] && ok "Свободно на /: ${DISK_FREE} GB" || warn "Свободно: ${DISK_FREE} GB (мало)"

# Тома под данные
echo ""
echo "[Тома под данные]"
[ -d /data/postgres ] && ok "/data/postgres существует" || warn "/data/postgres не создан"
[ -d /mnt/backup-disk/jtd ] && ok "/mnt/backup-disk/jtd существует" || warn "каталог бэкапов не создан"

# Порты
echo ""
echo "[Порты]"
for PORT in 80 443; do
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    warn "порт ${PORT} уже занят"
  else
    ok "порт ${PORT} свободен"
  fi
done

# Итог
echo ""
echo "==========================================="
echo " OK: ${PASS}  Предупреждений: ${WARN}  Ошибок: ${FAIL}"
echo "==========================================="
if [ "$FAIL" -gt 0 ]; then
  echo " СТАТУС: НЕ ГОТОВ — устрани ошибки"
  exit 1
else
  [ "$WARN" -gt 0 ] && echo " СТАТУС: ГОТОВ С ОГОВОРКАМИ (см. предупреждения)" || echo " СТАТУС: ПОЛНОСТЬЮ ГОТОВ"
  exit 0
fi
