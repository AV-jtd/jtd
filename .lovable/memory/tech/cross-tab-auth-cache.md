---
name: cross-tab-auth-cache
description: BroadcastChannel + localStorage cache and dedup for auth metadata to avoid duplicate Supabase fetches when multiple tabs open
type: tech
---
Чтобы открытие нескольких вкладок не порождало N параллельных запросов профиля/ролей/admin_mode, в `src/lib/authCache.ts` реализован межвкладочный слой:

- **localStorage snapshot** `auth_meta_v1:<userId>` с TTL 60 сек хранит {isApproved, isAdmin, isConsultant, adminModeDisabled}. На старте `useAuth.fetchProfile` сначала читает кэш и при попадании пропускает сеть полностью.
- **In-flight lock** `auth_meta_lock_v1:<userId>` (TTL 5 сек) — если другая вкладка уже грузит, текущая ждёт 1.5 сек broadcast, потом fallback на свой запрос.
- **BroadcastChannel "auth-meta-v1"** — закончившая запрос вкладка пушит снэпшот всем остальным, они применяют его без обращения к БД.
- Запись в кэш + broadcast делаются после успешного `fetchProfile` и в `setAdminModeDisabled`.
- `signOut()` очищает весь кэш через `clearAuthMeta()`.
