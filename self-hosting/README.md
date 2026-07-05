# Supabase self-hosted — план миграции

## Что переносим

| Компонент | Статус |
|---|---|
| PostgreSQL БД | мигрируем через pg_dump |
| Auth (GoTrue) | входит в стек, пользователи переносятся с БД |
| REST API (PostgREST) | входит в стек, код не меняем |
| Realtime | входит в стек, код не меняем |
| Edge Functions (25 штук) | входят в стек, код не меняем* |
| Cron задания | обновляем URL через migrate-cron.sql |
| Фронтенд | собираем с новым VITE_SUPABASE_URL |

*Одно исключение — см. блок "AI Gateway" ниже.

---

## Шаг 1 — Выбор VPS

Рекомендация: **Selectel** или **Timeweb Cloud**
- Минимум: 4 vCPU, 8 GB RAM, 80 GB SSD
- ОС: Ubuntu 22.04
- Регион: Россия (Москва или СПб)

---

## Шаг 2 — Настройка сервера

```bash
# На сервере:
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 certbot python3-certbot-nginx git

# Клонируем репозиторий
git clone https://github.com/AV-jtd/jtd.git
cd jtd

# SSL сертификат (сначала запусти nginx на 80 без SSL)
certbot certonly --standalone -d justtodoit.ru
```

---

## Шаг 3 — Генерация ключей

```bash
# Генерируем случайные секреты
JWT_SECRET=$(openssl rand -base64 32)
SECRET_KEY_BASE=$(openssl rand -base64 64)
POSTGRES_PASSWORD=$(openssl rand -base64 24)

echo "JWT_SECRET=$JWT_SECRET"
echo "SECRET_KEY_BASE=$SECRET_KEY_BASE"
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"

# Генерируем ANON_KEY и SERVICE_ROLE_KEY
node self-hosting/generate-keys.js "$JWT_SECRET"
```

Заполни `self-hosting/.env.supabase` этими значениями.

---

## Шаг 4 — AI Gateway

Функции используют `https://ai.gateway.lovable.dev` с `LOVABLE_API_KEY`.
Это обычный HTTP эндпоинт — запросы к нему делаются с твоего сервера,
ограничений по IP нет. Просто перенеси тот же ключ из Supabase Dashboard
→ Secrets в `.env.supabase`:

```
LOVABLE_API_KEY=<скопировать из Supabase Dashboard → Project Settings → Edge Function Secrets>
```

Код функций менять не нужно.

Если ключ перестанет работать (маловероятно) — запасной план: OpenRouter.ai
поддерживает те же модели `google/gemini-2.5-flash` с тем же API форматом.

---

## Шаг 5 — Миграция данных

```bash
# На старом Supabase (облако) — выгрузка
# В Supabase Dashboard → Settings → Database → Connection string
pg_dump "postgresql://postgres:[DB_PASSWORD]@db.nvfioycpwyzwukvokwql.supabase.co:5432/postgres" \
  --no-owner --no-privileges \
  -f backup.sql

# На новом сервере — загрузка (после запуска стека)
docker compose -f self-hosting/docker-compose.supabase.yml exec db \
  psql -U postgres postgres < backup.sql
```

---

## Шаг 6 — Запуск стека

```bash
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  up -d
```

---

## Шаг 7 — Обновление cron заданий

```bash
# Заменить ANON_KEY в migrate-cron.sql на реальный ключ, затем:
docker compose -f self-hosting/docker-compose.supabase.yml exec db \
  psql -U postgres postgres < self-hosting/migrate-cron.sql
```

---

## Шаг 8 — Сборка и деплой фронтенда

```bash
# .env обновить:
VITE_SUPABASE_URL=https://justtodoit.ru
VITE_SUPABASE_PUBLISHABLE_KEY=<новый ANON_KEY>
VITE_SUPABASE_PROXY_URL=   # оставить пустым — nginx сам проксирует

bun run build
# dist/ → скопировать на сервер в /app/jtd/dist/
```

---

## Секреты для переноса

Из Supabase Dashboard → Project Settings → Edge Function Secrets:

| Переменная | Откуда взять |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather в Telegram |
| `LOVABLE_API_KEY` | openrouter.ai → Keys |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — подставляются автоматически edge-runtime контейнером.
