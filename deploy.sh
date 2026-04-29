#!/bin/bash
set -e

# Автоматически определяем IP сервера, или берём первый аргумент
SERVER_IP=${1:-$(hostname -I | awk '{print $1}')}

echo "=============================="
echo "Деплой JustTODOit"
echo "Адрес сервера: $SERVER_IP"
echo "=============================="

export SERVER_IP

docker compose up --build -d

echo ""
echo "Готово! Приложение доступно по адресу:"
echo "  http://$SERVER_IP"
echo ""
echo "Логи: docker compose logs -f"
echo "Остановить: docker compose down"
