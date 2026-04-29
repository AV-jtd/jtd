# Supabase прокси — деплой на Railway

## Шаг 1 — Зарегистрируйся на Railway

Зайди на https://railway.app и войди через GitHub аккаунт.
Бесплатный план даёт $5 кредита в месяц — для прокси хватит.

## Шаг 2 — Создай новый проект

1. Нажми **New Project**
2. Выбери **Deploy from GitHub repo**
3. Выбери репозиторий `jtd`
4. Railway спросит какую папку деплоить — укажи `proxy-server`

   Если не спросит — после создания зайди в настройки сервиса:
   **Settings → Source → Root Directory** → введи `proxy-server`

## Шаг 3 — Получи URL

После деплоя Railway покажет URL вида:
`https://jtd-supabase-proxy-production.up.railway.app`

## Шаг 4 — Добавь в Lovable

1. Lovable → Settings → Environment Variables
2. Name: `VITE_SUPABASE_PROXY_URL`
3. Value: URL из шага 3
4. Save → Publish
