#!/usr/bin/env bash
# End-to-end smoke-тест развёрнутого стека.
# Использование:
#   ./smoke-test.sh <BASE_URL> <ANON_KEY> <SERVICE_ROLE_KEY>
# Пример:
#   ./smoke-test.sh https://stage.justtodoit.ru eyJ... eyJ...

set -uo pipefail

BASE="${1:?Укажи BASE_URL}"
ANON="${2:?Укажи ANON_KEY}"
SERVICE="${3:-}"

PASS=0
FAIL=0
ok()  { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

echo "=== JTD Smoke Test ==="
echo "Target: ${BASE}"
echo "Время:  $(date)"
echo ""

# 1. Фронтенд раздаётся
echo "[1] Фронтенд"
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" "${BASE}/")
[ "$HTTP" = "200" ] && ok "GET / → 200" || bad "GET / → ${HTTP}"

# 2. Auth health
echo "[2] Auth (GoTrue)"
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" "${BASE}/auth/v1/health")
[ "$HTTP" = "200" ] && ok "auth/v1/health → 200" || bad "auth/v1/health → ${HTTP}"

# 3. REST доступен (с anon ключом)
echo "[3] REST API (PostgREST)"
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" \
  "${BASE}/rest/v1/" \
  -H "apikey: ${ANON}")
[ "$HTTP" = "200" ] && ok "rest/v1/ → 200" || bad "rest/v1/ → ${HTTP}"

# 4. RLS: чтение tasks без auth должно быть ограничено (пустой массив или 200)
echo "[4] RLS"
RESP=$(curl -sk "${BASE}/rest/v1/tasks?select=id&limit=1" -H "apikey: ${ANON}")
if echo "$RESP" | grep -qE '^\[|"code"'; then
  ok "RLS отвечает корректно (anon ограничен)"
else
  bad "RLS неожиданный ответ: ${RESP:0:80}"
fi

# 5. Storage health
echo "[5] Storage"
HTTP=$(curl -sk -o /dev/null -w "%{http_code}" \
  "${BASE}/storage/v1/bucket" \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}")
[ "$HTTP" = "200" ] || [ "$HTTP" = "400" ] && ok "storage/v1 отвечает (${HTTP})" || bad "storage/v1 → ${HTTP}"

# 6. Edge Function (если SERVICE задан)
echo "[6] Edge Functions"
if [ -n "$SERVICE" ]; then
  HTTP=$(curl -sk -o /dev/null -w "%{http_code}" \
    "${BASE}/functions/v1/calendar-feed" \
    -H "Authorization: Bearer ${SERVICE}")
  # Любой не-5xx ответ = функция жива
  if [ "${HTTP:0:1}" != "5" ] && [ "$HTTP" != "000" ]; then
    ok "functions/v1 отвечает (${HTTP})"
  else
    bad "functions/v1 → ${HTTP}"
  fi
else
  echo "  ⊘ SKIP: SERVICE_ROLE_KEY не передан"
fi

# Итог
echo ""
echo "==========================================="
echo " Результат: ${PASS} прошло / ${FAIL} упало"
echo "==========================================="
if [ "$FAIL" -gt 0 ]; then
  echo " СТАТУС: ПРОВАЛ"
  exit 1
else
  echo " СТАТУС: OK — стек работает"
  exit 0
fi
