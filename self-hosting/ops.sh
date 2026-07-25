#!/usr/bin/env bash
# Обслуживающие операции VPS. Вызывается из ops-vps.yml (GitHub Actions) по SSH
# или вручную: bash self-hosting/ops.sh <operation> [arg]
#
# ВАЖНО (репозиторий публичный): секреты и пароли НИКОГДА не печатать в stdout —
# логи Actions видны всем. Пароли доставляются только через Telegram.
#
# Разрешён только предопределённый список операций (case ниже). Незнакомая
# операция → выход с ошибкой (workflow не должен исполнять произвольное).

set -euo pipefail

REPO_DIR="/opt/jtd"
COMPOSE="$REPO_DIR/self-hosting/docker-compose.supabase.yml"
ENV_FILE="$REPO_DIR/self-hosting/.env.supabase"
OP="${1:-}"
ARG="${2:-}"

envval() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2-; }
psql_q() { docker exec self-hosting-db-1 psql -U postgres -tAc "$1"; }

case "$OP" in
  # ---------- Диагностика ----------
  health-check)
    echo "== Контейнеры =="
    docker ps --format 'table {{.Names}}\t{{.Status}}'
    echo ""
    echo "== Эндпоинты =="
    echo "site:  $(curl -sk -o /dev/null -w '%{http_code}' https://justtodoit.ru/)"
    echo "rest:  $(curl -sk -o /dev/null -w '%{http_code}' https://justtodoit.ru/sb/rest/v1/)"
    echo "auth:  $(curl -sk -o /dev/null -w '%{http_code}' https://justtodoit.ru/sb/auth/v1/health)"
    ;;

  # ---------- Бэкап ----------
  backup-now)
    bash "$REPO_DIR/self-hosting/backup/backup.sh" --s3 --verify
    ;;

  # ---------- Перезапуск сервиса ----------
  restart)
    case "$ARG" in
      nginx|edge-runtime|realtime|auth|rest|kong|storage|db)
        docker compose -f "$COMPOSE" --env-file "$ENV_FILE" restart "$ARG"
        echo "restarted: $ARG" ;;
      *) echo "restart: недопустимый сервис '$ARG'"; exit 2 ;;
    esac
    ;;

  # ---------- Хвост логов сервиса (без секретов) ----------
  logs)
    case "$ARG" in
      nginx|edge-runtime|realtime|auth|rest|kong|storage|db)
        docker logs "self-hosting-${ARG}-1" --tail 100 2>&1 ;;
      *) echo "logs: недопустимый сервис '$ARG'"; exit 2 ;;
    esac
    ;;

  # ---------- Сброс пароля одному юзеру (доставка ТОЛЬКО в Telegram) ----------
  reset-password)
    email="$ARG"
    [ -z "$email" ] && { echo "reset-password: нужен email аргументом"; exit 2; }
    uid="$(psql_q "SELECT id FROM auth.users WHERE lower(email)=lower('$email')")"
    [ -z "$uid" ] && { echo "не найден пользователь с email=$email"; exit 1; }
    chat="$(psql_q "SELECT telegram_chat_id FROM public.profiles WHERE id='$uid'")"
    # временный пароль (в лог НЕ печатаем)
    pw="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 14)"
    SRK="$(envval SERVICE_ROLE_KEY)"
    # задать пароль через GoTrue Admin API (локальный Kong)
    code="$(curl -s -o /dev/null -w '%{http_code}' -X PUT \
      "http://localhost:8000/auth/v1/admin/users/$uid" \
      -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
      -H "Content-Type: application/json" \
      -d "{\"password\":\"$pw\"}")"
    [ "$code" != "200" ] && { echo "Admin API вернул $code — пароль НЕ изменён"; exit 1; }
    if [ -n "$chat" ] && [ "$chat" != "" ]; then
      TB="$(envval TELEGRAM_BOT_TOKEN)"
      msg="JustTODOit переехал на новый сервер (работаем без VPN). Ваш новый пароль: ${pw}. Войдите на https://justtodoit.ru и смените его в настройках профиля."
      tg="$(curl -s -o /dev/null -w '%{http_code}' \
        "https://api.telegram.org/bot${TB}/sendMessage" \
        --data-urlencode "chat_id=${chat}" \
        --data-urlencode "text=${msg}")"
      if [ "$tg" = "200" ]; then
        echo "OK: пароль сброшен, отправлен в Telegram пользователю $email"
      else
        echo "Пароль сброшен, но Telegram-отправка вернула $tg — нужна ручная доставка через VPS-Claude (пароль в лог не выводится)"
      fi
    else
      echo "Пароль сброшен, но у $email НЕТ telegram_chat_id — доставь вручную через VPS-Claude (пароль в лог не выводится из соображений безопасности: репозиторий публичный)"
    fi
    ;;

  *)
    echo "Неизвестная операция: '$OP'"
    echo "Доступно: health-check | backup-now | restart <svc> | logs <svc> | reset-password <email>"
    exit 2
    ;;
esac
