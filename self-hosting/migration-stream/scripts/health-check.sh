#!/usr/bin/env bash
# Быстрая проверка здоровья контейнеров стека + базовых эндпоинтов (фаза 1).
# Использование: ./health-check.sh <BASE_URL> <ANON_KEY>

set -uo pipefail

BASE="${1:?Укажи BASE_URL}"
ANON="${2:?Укажи ANON_KEY}"
COMPOSE_FILE="${COMPOSE_FILE:-self-hosting/docker-compose.supabase.yml}"
ENV_FILE="${ENV_FILE:-self-hosting/.env.supabase}"

PASS=0; FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=== Health Check (фаза 1) ==="
echo ""

# Статусы контейнеров
echo "[Контейнеры]"
for SVC in db auth rest realtime storage edge-runtime kong nginx; do
  STATE=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk -v s="$SVC" '$1==s{print $2}')
  if echo "$STATE" | grep -qiE "running|up"; then
    ok "${SVC}: ${STATE}"
  else
    bad "${SVC}: ${STATE:-отсутствует}"
  fi
done

# Эндпоинты
echo ""
echo "[Эндпоинты]"
check_ep() {
  local name="$1" url="$2"; shift 2
  local code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" "$@")
  if [ "${code:0:1}" = "2" ] || [ "${code:0:1}" = "3" ] || [ "$code" = "400" ]; then
    ok "${name} (${code})"
  else
    bad "${name} (${code})"
  fi
}
check_ep "frontend /" "${BASE}/"
check_ep "auth health" "${BASE}/auth/v1/health"
check_ep "rest" "${BASE}/rest/v1/" -H "apikey: ${ANON}"
check_ep "storage" "${BASE}/storage/v1/bucket" -H "apikey: ${ANON}" -H "Authorization: Bearer ${ANON}"

echo ""
echo "==========================================="
echo " OK: ${PASS}  Ошибок: ${FAIL}"
echo "==========================================="
[ "$FAIL" -gt 0 ] && { echo " СТАТУС: ЕСТЬ ПРОБЛЕМЫ"; exit 1; } || { echo " СТАТУС: ЗДОРОВ"; exit 0; }
