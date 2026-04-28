# JTD Cloudflare Worker (Supabase Proxy)

Прокси к Supabase для обхода блокировок/замедлений у некоторых провайдеров.
Проксирует **REST + Auth + Storage + Functions + Realtime (WebSocket)**.

## Деплой (один раз)

```bash
npm install -g wrangler
wrangler login         # авторизация через браузер (нужен Cloudflare-аккаунт, бесплатный)
cd cf-worker
wrangler deploy
```

После деплоя в консоли появится URL вида:

```
https://jtd-proxy.<your-account>.workers.dev
```

## Подключение к фронтенду

Скопируйте этот URL и пропишите его в файле **`src/lib/supabaseProxy.ts`** в константу `PROXY_HOST`
(БЕЗ `https://`, только хост: `jtd-proxy.<your-account>.workers.dev`).

После публикации фронта (Lovable → Publish → Update) клиент начнёт ходить через Worker
вместо прямого `nvfioycpwyzwukvokwql.supabase.co`.

## Опционально: свой домен

В настройках Worker можно привязать `api.justtodoit.ru` — тогда трафик уйдёт под ваш собственный домен,
что ещё устойчивее к DPI-фильтрам.

## Откат

Если что-то пойдёт не так — поставьте `PROXY_HOST = ""` в `src/lib/supabaseProxy.ts` и опубликуйте.
Клиент сразу вернётся к прямому соединению с Supabase.