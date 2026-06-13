#!/usr/bin/env bash
# Проверка, что реальный пользователь может залогиниться (пароли перенеслись).
# Использование: ./test-real-login.sh <host> <email> <password> [ANON_KEY]
#   host без https:// — например stage.justtodoit.ru

set -uo pipefail

HOST="${1:?Укажи host}"
EMAIL="${2:?Укажи email}"
PASSWORD="${3:?Укажи password}"
ANON="${4:-${ANON_KEY:-}}"

[ -n "$ANON" ] || { echo "Укажи ANON_KEY 4-м аргументом или в env"; exit 1; }

echo "=== Тест реального логина ==="
echo "Host:  https://${HOST}"
echo "Email: ${EMAIL}"
echo ""

RESP=$(curl -sk -X POST \
  "https://${HOST}/auth/v1/token?grant_type=password" \
  -H "apikey: ${ANON}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

if echo "$RESP" | grep -q "access_token"; then
  echo "✓ OK — логин успешен, пароль перенёсся корректно"
  echo "  (access_token получен)"
  exit 0
else
  echo "✗ ПРОВАЛ — логин не удался"
  echo "  Ответ: $(echo "$RESP" | head -c 200)"
  exit 1
fi
