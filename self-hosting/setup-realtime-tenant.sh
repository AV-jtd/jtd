#!/usr/bin/env bash
# Создаёт (идемпотентно, через PUT) tenant для self-hosted Supabase Realtime.
#
# Контекст: self-hosted Realtime (v2.30.34) — мультитенантный сервис.
# external_id тенанта, который он ищет при подключении клиента, берётся
# из переменной окружения APP_NAME сервиса realtime в docker-compose
# (у нас APP_NAME=realtime). Ни официальный docker-compose, ни наш setup
# не создают эту запись автоматически — без неё ЛЮБОЕ WS-подключение
# получает 403/"Tenant not found", даже если nginx/Kong настроены верно.
#
# Тенант создаётся через Admin API самого realtime (PUT /api/tenants/<id>),
# а не прямым INSERT в _realtime.tenants/_realtime.extensions — сервис сам
# шифрует чувствительные поля (jwt_secret, db_password и др.) через
# DB_ENC_KEY (Cloak/AES-128-ECB), руками эту шифровку не воспроизвести.
#
# Запускать после первого поднятия стека или после смены JWT_SECRET/
# POSTGRES_PASSWORD/REALTIME_DB_ENC_KEY.
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=".env.supabase"

get() { grep "^$1=" "$ENV_FILE" | cut -d= -f2-; }

JWT_SECRET=$(get JWT_SECRET)
POSTGRES_PASSWORD=$(get POSTGRES_PASSWORD)
SERVICE_ROLE_KEY=$(get SERVICE_ROLE_KEY)

REALTIME_CONTAINER="${REALTIME_CONTAINER:-self-hosting-realtime-1}"
TENANT_EXTERNAL_ID="${TENANT_EXTERNAL_ID:-realtime}"  # = APP_NAME из docker-compose

REALTIME_IP=$(docker inspect "${REALTIME_CONTAINER}" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

PAYLOAD=$(cat <<EOF
{
  "tenant": {
    "external_id": "${TENANT_EXTERNAL_ID}",
    "name": "${TENANT_EXTERNAL_ID}",
    "jwt_secret": "${JWT_SECRET}",
    "max_concurrent_users": 200,
    "extensions": [
      {
        "type": "postgres_cdc_rls",
        "settings": {
          "db_host": "db",
          "db_name": "postgres",
          "db_user": "supabase_admin",
          "db_password": "${POSTGRES_PASSWORD}",
          "db_port": "5432",
          "region": "self-hosted",
          "poll_interval_ms": 100,
          "poll_max_record_bytes": 1048576,
          "publication": "supabase_realtime",
          "slot_name": "supabase_realtime_replication_slot",
          "ssl_enforced": false
        }
      }
    ]
  }
}
EOF
)

echo "Создаю/обновляю тенант '${TENANT_EXTERNAL_ID}' на realtime (${REALTIME_IP}:4000)..."
RESP=$(curl -s -w '\n%{http_code}' -X PUT "http://${REALTIME_IP}:4000/api/tenants/${TENANT_EXTERNAL_ID}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  --data "${PAYLOAD}")

HTTP_CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

echo "HTTP ${HTTP_CODE}"
echo "$BODY"

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "ОШИБКА: тенант не создан/не обновлён" >&2
  exit 1
fi

echo "OK"
