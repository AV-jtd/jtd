---
name: profiles cache (useAvailableUsers)
description: useAvailableUsers must keep staleTime/gcTime — без него имена в чипах участников показываются как UUID-обрезки (188e3429).
type: tech
---
`useAvailableUsers` (src/hooks/useTasks.tsx) обязан иметь:
- staleTime: 5 мин
- gcTime: 30 мин
- refetchOnMount: false, refetchOnWindowFocus: false

Хук вызывается из 30+ компонентов (TaskItem, PortfolioView, NpdBoard, MessengerPanel...). Без кэша при каждой навигации запрос летит заново, и `getProfileName()` рендерит `userId.slice(0,8)` (короткие хеши вроде "5770bc5b" в чипах участников/делегации) до прихода profiles. RLS на profiles тяжёлая (9 SELECT-policy с EXISTS по task_participants/tasks) — лишние запросы дороги.

## Маппинг id → display_name через единый кэш
- TaskItem.getProfileName: O(1) через `useMemo(Map)`, fallback не UUID, а "…".
- useMessenger (useThreads): сначала читает `qc.getQueryData(["available_users", user.id])` и запрашивает `profiles` ТОЛЬКО для отсутствующих авторов (бывшие участники, гости). Раньше всегда летел отдельный `profiles.in("id", authorIds)`.
- Запрещено: повторно вызывать `supabase.from("profiles").select(...).in("id", ...)` из компонентов/хуков для отображения имён. Используйте `useAvailableUsers()` или `qc.getQueryData(["available_users", userId])`.
