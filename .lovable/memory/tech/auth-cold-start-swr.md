---
name: auth cold-start stale-while-revalidate
description: Auth meta cache applies stale snapshot instantly on cold start to avoid 20-30s spinner on slow RF proxy; email cron slowed to 30s
type: tech
---
Холодный старт auth не должен висеть на спиннере 20–30с при тормозящем Cloudflare-прокси (РФ).

- `src/lib/authCache.ts`: добавлен `readAuthMetaStale(userId)` — читает снэпшот ролей/approval БЕЗ проверки TTL.
- `src/hooks/useAuth.tsx` `fetchProfile`: после промаха свежего кэша (TTL 60s) и только на attempt===0 применяет stale-снэпшот мгновенно (`setLoading(false)`), затем всё равно идёт в сеть в фоне и обновляет значения (stale-while-revalidate). На retries stale не применяется, чтобы не мигать.
- Cron `process-email-queue` (jobid 11) переведён с `5 seconds` на `30 seconds` через `cron.alter_job` (insert-tool, не миграция — содержит ключи) — убрал лишний connection-churn.
