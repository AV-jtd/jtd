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

## 👥 Доступ внутренних участников встречи (`protocol_meta.internal_attendees`)

Раньше пользователи, добавленные во вкладке «Участники встречи», могли быть **не owner**, **не group_member**, **не assignee** ни одной задачи — и потому **вообще не видели протокол**. Особенно болезненно для черновиков (когда задачи ещё не разданы).

**Правило (закреплено в RLS):**
- Если `auth.uid()` числится в `task_groups.protocol_meta.internal_attendees` (массив UUID-строк), пользователь:
  - **Всегда видит** сам протокол (`task_groups`), его задачи (`tasks`, включая `is_draft=true`), шаги (`subtasks`), комментарии (`task_comments`).
  - **Пока `draft_status='draft'`** — может INSERT/UPDATE/DELETE задач/шагов и UPDATE самого протокола (полноправный соавтор черновика).
  - **После публикации** — продолжает видеть, но правит только свои задачи (как обычный assignee/participant).

SQL-функции (SECURITY DEFINER, search_path=public):
- `is_protocol_internal_attendee(_group_id, _user_id) → boolean` — основной чек.
- `is_protocol_draft(_group_id) → boolean` — `project_type='protocol' AND draft_status='draft'`.
- `is_task_in_protocol_attendee_scope(_task_id, _user_id, _draft_only) → boolean` — для дочерних таблиц (`subtasks`, `task_comments`).

UI: на `ProtocolDetailPage` если юзер не владелец, но числится в `internal_attendees` — в баннере черновика рядом со словом «Черновик» появляется чип `Участник` (primary палитра).

⚠️ При добавлении новых дочерних таблиц протокола (вложения, опросы, голосования) — НЕ забыть аналогичные RLS-политики на `is_task_in_protocol_attendee_scope` или `is_protocol_internal_attendee`.

Ключевые файлы:
- `src/lib/projectCsv.ts` — `importCsvToProject` принимает `{ asDraft, projectType }`.
- `src/components/SmartImportDialog.tsx` — props `asDraft`, `projectType`.
- `src/modules/protocols/components/UnifiedImportDialog.tsx` — всегда передаёт `asDraft=true`.
- `src/hooks/usePublishProtocol.tsx` — `usePublishProtocol`, `useDiscardProtocolDraft`.
- `src/modules/protocols/pages/ProtocolDetailPage.tsx` — баннер.
- `src/hooks/useTasks.tsx` (~строки 178-186) — единственное место фильтра `is_draft`.
