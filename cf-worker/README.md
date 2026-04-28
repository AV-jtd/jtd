# Прокси для обхода блокировки Supabase

Supabase блокирует запросы из России. Этот воркер запускается на серверах
Cloudflare по всему миру и пересылает запросы от пользователей в Supabase —
минуя блокировку.

---

## Шаг 1 — Зарегистрируйся на Cloudflare (бесплатно)

Зайди на https://dash.cloudflare.com/sign-up и создай аккаунт.
Карту привязывать не нужно — бесплатный план включает 100 000 запросов в день.

---

## Шаг 2 — Установи Wrangler (инструмент деплоя)

Открой терминал и выполни:

```bash
npm install -g wrangler
```

Затем войди в аккаунт Cloudflare:

```bash
wrangler login
```

Откроется браузер — нажми «Allow» и вернись в терминал.

---

## Шаг 3 — Задеплой воркер

Перейди в папку `cf-worker` внутри проекта:

```bash
cd cf-worker
wrangler deploy
```

В терминале появится URL вида:

```
https://jtd-supabase-proxy.ТВОЙ_АККАУНТ.workers.dev
```

Скопируй его — он понадобится на следующем шаге.

---

## Шаг 4 — Добавь URL в Lovable

1. Открой https://lovable.dev и зайди в свой проект
2. Нажми **Settings** (шестерёнка) → **Environment Variables**
3. Нажми **Add variable** и заполни:
   - **Name:** `VITE_SUPABASE_PROXY_URL`
   - **Value:** URL из шага 3, например `https://jtd-supabase-proxy.myaccount.workers.dev`
4. Нажми **Save**

---

## Шаг 5 — Опубликуй приложение

В Lovable нажми кнопку **Publish** (или **Deploy**).

После публикации все запросы к базе данных пойдут через Cloudflare —
пользователи из России смогут нормально входить в приложение.

---

## Проверка

Открой приложение, открой DevTools → Network.
Запросы `profiles`, `tasks`, `task_groups` и т.д. должны отвечать со статусом
**200** и временем **< 500 мс** вместо вечного Pending.

---

## Если что-то пошло не так

| Симптом | Решение |
|---------|---------|
| `wrangler: command not found` | Переоткрой терминал после `npm install -g wrangler` |
| `Error: Not logged in` | Выполни `wrangler login` ещё раз |
| Запросы всё ещё Pending | Убедись, что в Lovable сохранена переменная и нажат Publish |
| 403 Forbidden от воркера | Проверь, что URL скопирован без лишнего `/` в конце |
