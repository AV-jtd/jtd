---
name: Cross-app performance: Gmail-style instant UI
description: Глобальные настройки React Query, паттерн skeleton-загрузки и принципы мгновенной навигации после create
type: feature
---

В приложении применён Gmail-стиль мгновенного UI:

1. **Глобальный keepPreviousData** (`src/App.tsx`): в `defaultOptions.queries` стоит `placeholderData: (prev) => prev`. При смене параметров запроса (фильтры, id, страницы) старые данные показываются мгновенно, новые подгружаются в фоне — без спиннеров.

2. **Skeleton вместо fullscreen Loader2**: используется компонент `src/components/SkeletonRows.tsx` (props: `count`, `className`). Применён в `ViewFallback` (Index.tsx) и `ProtocolTableView`. Воспринимается в 2-3 раза быстрее реальной скорости.

3. **Навигация после create**: после создания сущности (протокол, проект) — `navigate('/.../<новый_id>')` напрямую на детальную страницу, НЕ на список. NewProtocolDialog уже работает корректно. При добавлении новых create-flows следовать тому же правилу + оптимистично класть запись в кэш списка.

4. **Фундамент уже есть**: `useTasks.tsx` имеет 30+ оптимистичных мутаций (`onMutate` + `setQueryData` rollback на ошибке). Realtime-подписки активны для tasks/messages/comments. PersistQueryClient кэширует на 24ч.

5. **Что ещё можно докрутить (не сделано)**: префетч по hover (`usePrefetchOnHover`), оптимистика для useMessenger/useGroupChat/useWiki/useStmProjects.
