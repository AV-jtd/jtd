#!/bin/bash
set -e

SERVER_IP=${1:-$(hostname -I | awk '{print $1}')}

echo "=============================="
echo "Обновление JustTODOit"
echo "Адрес сервера: $SERVER_IP"
echo "=============================="

git pull origin main

export SERVER_IP
docker compose up --build -d

echo ""
echo "Готово! Приложение обновлено: http://$SERVER_IP"
