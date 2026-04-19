---
name: protocol-draft-publish
description: Импорт протокола идёт в режиме "Черновик" — задачи не публикуются и не уведомляют исполнителей до явного действия "Опубликовать" на странице протокола.
type: feature
---

## Flow «Черновик → Mission Control → Публикация»

Импорт Excel/PDF/Текст для протоколов всегда создаёт проект в статусе **черновик**:

- `task_groups.draft_status` — `'draft' | 'published'` (default `published` для совместимости).
- `tasks.is_draft` — boolean (default `false`). Задачи-черновики не показываются в дашбордах исполнителей.
- При импорте через `SmartImportDialog` (props `asDraft={true}`, `projectType="protocol"`) и `importCsvToProject(..., { asDraft: true, projectType: 'protocol' })` создаётся группа со статусом draft и задачи с `is_draft=true`.
- После импорта пользователя редиректит на `/protocols/:id` (Mission Control), где сверху виден жёлтый баннер «Режим черновика — N задач» с кнопками **Опубликовать протокол** и **Удалить черновик**.
- Публикация (`usePublishProtocol`): bulk UPDATE `is_draft=false` + `draft_status='published'`. Уведомления массово НЕ рассылаются (MVP) — это можно добавить позже batch-вызовом `notify-event`.
- Удаление (`useDiscardProtocolDraft`): полный delete группы (каскад снесёт задачи).

## ⚠️ Инвариант видимости черновиков

`useTasks(groupId?)` фильтрует `is_draft=true` ТОЛЬКО когда `groupId` не задан (глобальные списки). При просмотре конкретного протокола черновики обязаны быть видны владельцу и участникам — иначе страница выглядит пустой.

**Правило для всех компонентов внутри `/protocols/:id`:** всегда вызывать `useTasks(protocolId)`, никогда `useTasks()` без аргумента. Это касается `ProtocolDetailPage`, `ProtocolTableView`, `ProtocolPreviewDialog`, `ProtocolInternalSection` и любых будущих секций (мобильная карточка, PDF-рендер, виджеты тем и т.п.). RLS уже разрешает участникам видеть `is_draft=true` — баг всегда клиентский.

Ключевые файлы:
- `src/lib/projectCsv.ts` — `importCsvToProject` принимает `{ asDraft, projectType }`.
- `src/components/SmartImportDialog.tsx` — props `asDraft`, `projectType`.
- `src/modules/protocols/components/UnifiedImportDialog.tsx` — всегда передаёт `asDraft=true`.
- `src/hooks/usePublishProtocol.tsx` — `usePublishProtocol`, `useDiscardProtocolDraft`.
- `src/modules/protocols/pages/ProtocolDetailPage.tsx` — баннер.
- `src/hooks/useTasks.tsx` (~строки 178-186) — единственное место фильтра `is_draft`.
