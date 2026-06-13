# Промпт для co-work: продолжение запуска стека на VPS

## Контекст

Переезд JTD (task-менеджер React + Supabase) на российский VPS Sweb.
Работаем через этот чат — команды даём блоками, пользователь выполняет
в SSH-терминале и присылает вывод.

## Состояние на момент передачи

**VPS:** `root@77.222.53.183`
**Репозиторий:** `/opt/jtd`, ветка `claude/modest-hawking-sfszra`
**Конфиг:** `/opt/jtd/self-hosting/.env.supabase` — создан и заполнен

**Ключи (уже в .env.supabase, НЕ менять):**
- POSTGRES_PASSWORD: `iwev3gEdoh2umKSnB7jqUOKAjlk0xF66`
- ANON_KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxMzUyOTAzLCJleHAiOjIwOTY3MTI5MDN9.8yPjuhZ1LrIkWFCcZi0BtOXwKTYD_omC7v1s0Q4tYz8`
- SERVICE_ROLE_KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3ODEzNTI5MDMsImV4cCI6MjA5NjcxMjkwM30.27vzjsrbUdIoN6ggxy_3eAI04bvZZRFHVyXtujV_RCY`
- S3: endpoint `https://s3.regru.cloud`, bucket `jtd-storage`

## Что уже сделано

- ✅ preflight-check = 14/14 OK
- ✅ .env.supabase создан (все ключи, S3, Telegram)
- ✅ nginx-full.conf создан (HTTP, без SSL пока)
- ✅ `docker compose up -d` — все 11 контейнеров стартовали
- ✅ db и nginx работают

## Текущая проблема (последнее что делали)

auth/rest/realtime/storage/kong/edge-runtime — в статусе `restarting`.

Причина: внутренние пользователи PostgreSQL (`supabase_auth_admin`,
`authenticator` и др.) не имеют пароля. Последняя команда которую нужно
выполнить:

```bash
docker exec self-hosting-db-1 psql -U postgres -c "
ALTER USER supabase_auth_admin WITH PASSWORD 'iwev3gEdoh2umKSnB7jqUOKAjlk0xF66';
ALTER USER authenticator WITH PASSWORD 'iwev3gEdoh2umKSnB7jqUOKAjlk0xF66';
ALTER USER supabase_storage_admin WITH PASSWORD 'iwev3gEdoh2umKSnB7jqUOKAjlk0xF66';
ALTER USER supabase_admin WITH PASSWORD 'iwev3gEdoh2umKSnB7jqUOKAjlk0xF66';
ALTER USER supabase_replication_admin WITH PASSWORD 'iwev3gEdoh2umKSnB7jqUOKAjlk0xF66';
"
```

```bash
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  restart auth rest realtime storage kong edge-runtime
```

## Что делать дальше (по порядку)

1. Исправить пароли пользователей БД (команды выше)
2. Дождаться пока все контейнеры перейдут в `running`
3. Запустить health-check:
   ```bash
   bash self-hosting/migration-stream/scripts/health-check.sh \
     http://localhost:8000 <ANON_KEY>
   ```
4. Если health-check OK → запустить расширения БД (pg_cron, pg_net):
   ```bash
   docker exec self-hosting-db-1 psql -U postgres -c "
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   CREATE EXTENSION IF NOT EXISTS pg_net;
   SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net');
   "
   ```
5. Перейти к Фазе 2: миграция данных из облачного Supabase
   - Connection string облака нужно запросить у пользователя
   - Использовать скрипты из `self-hosting/migration-stream/scripts/`

## Правила работы

- Команды давать блоками для копипаста в терминал
- После каждого вывода — интерпретировать результат
- НЕ переходить к следующему шагу если текущий не OK
- Перед переключением DNS (фаза 4) — обязательный стоп
- SSL-сертификат выпустить ПОСЛЕ того как DNS переключится на этот VPS

## Дополнительный контекст

- Системный nginx был остановлен (`systemctl disable nginx`), порты 80/443 свободны
- Portainer работает на порту 9000 (не мешает)
- Kong слушает на порту 8000
- Полный план переезда: `self-hosting/migration-stream/README.md`
- Прогресс: `self-hosting/migration-stream/PROGRESS.md`
