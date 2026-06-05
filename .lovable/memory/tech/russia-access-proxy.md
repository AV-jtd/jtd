---
name: russia-access-proxy
description: Supabase access — proxy REMOVED, now direct connection. History of the Cloudflare Worker proxy attempt.
type: feature
---
# Доступ к Supabase — текущее решение: ПРЯМОЕ подключение

**Статус (05.06.2026): прокси УБРАН.** Клиент ходит в Supabase напрямую:
`VITE_SUPABASE_URL = https://nvfioycpwyzwukvokwql.supabase.co`. Никакого `VITE_SUPABASE_PROXY_URL` в `.env` нет.

## Почему убрали
Домен `justtodoit.ru` нельзя одновременно использовать под Cloudflare Worker-прокси (`/sb/*`)
и под хостинг фронтенда Lovable — это взаимоисключающие конфигурации на одном домене.
При переносе домена на Lovable (A → 185.158.133.1) и удалении старой зоны Cloudflare
Worker-прокси умер → `justtodoit.ru/sb/*` отдавал 1001 → во всём приложении (вкл. превью) «Failed to fetch».
Решение пользователя: отказаться от прокси совсем, домен отдать под приложение Lovable.

## Последствия / риск
Пользователи из РФ могут не достучаться до `*.supabase.co` напрямую (гео-блокировка) —
это осознанный компромисс. Если снова понадобится обход, ставить прокси на ОТДЕЛЬНЫЙ
поддомен (напр. `sb.justtodoit.ru`), а корень оставить под Lovable.

## Файлы
- `.env` — только `VITE_SUPABASE_URL` (прямой supabase.co), proxy-переменной НЕТ.
- `src/integrations/supabase/client.ts` — `resolveSupabaseUrl()`: explicit proxy (нет) → /sb при `__SB_PROXY__` на не-lovable хосте (self-host VPS) → иначе прямой URL.
- `src/lib/supabaseFetchGuard.ts` — НЕ навязывает маршрут, только троттлинг (MAX_CONCURRENT=12) и таймауты. Безопасен при прямом подключении.

## История (legacy, не активно)
Был Cloudflare Worker `round-morning-5599...workers.dev`, маршрут `justtodoit.ru/sb/*`.
Резервный VPS `77.222.53.183` (Docker) — для возможного self-host.
