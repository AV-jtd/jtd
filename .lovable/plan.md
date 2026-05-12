## Что делаем

Добавляем сквозную сущность **Решения (Decisions)** — отдельную таблицу, привязанную к протоколу, проектам и осям-тегам, с опциональным ограничением видимости. Решения видны во всех модулях: Протоколах (где приняты), PMO (на карточке проекта), CRM (на карточке клиента/сделки).

Сейчас «решение» = текстовое поле `tasks.closure_result` на отдельной строке протокола. Этого мало: невозможно искать по решениям, привязать к нескольким проектам/тегам, ограничить круг лиц, агрегировать по клиенту/бренду.

## Модель данных

Новая таблица `decisions`:
- `id`, `user_id` (автор), `created_at`, `updated_at`
- `protocol_id uuid` — ссылка на `task_groups` (протокол, где принято)
- `source_task_id uuid NULL` — опц. строка протокола, из которой создано
- `title text`, `body text` — суть решения
- `decided_at timestamptz` — дата принятия (по умолчанию сегодня)
- `status text` — `active` | `revoked` | `superseded` (с `superseded_by uuid`)
- `visibility text` — `protocol` (видят все, кто видит протокол — дефолт) | `restricted` (только указанный круг)

Связи M2M:
- `decision_projects(decision_id, group_id)` — намертво пришитые проекты
- `decision_tags(decision_id, tag_id)` — оси (любые системные/пользовательские)
- `decision_clients(decision_id, client_id)` — для CRM
- `decision_viewers(decision_id, user_id)` — круг лиц при `visibility='restricted'`

## Видимость (RLS)

Функция `can_see_decision(_decision_id, _user_id)`:
- админ → да
- автор → да
- если `visibility='protocol'` → проверка доступа к `protocol_id` (через `is_group_member` / `is_group_owner` / `is_task_in_protocol_attendee_scope`-логику)
- если `visibility='restricted'` → запись в `decision_viewers` ИЛИ автор ИЛИ участник любого из связанных проектов

SELECT/INSERT/UPDATE/DELETE policies — стандартный набор: автор + админ редактируют, видимость через функцию. Консультантам — блок (как везде).

## UI

**1. Протокол (`/protocols/:id`)**
- Новая вкладка/секция «Решения» в шапке протокола (рядом с Таблица/Список/Чат/Wiki).
- Кнопка «+ Решение» в шапке + быстрое действие в раскрытой строке таблицы: «Превратить решение в Decision» (берёт `closure_result` или создаёт новое).
- Карточка решения: заголовок, текст, дата, чипы привязанных проектов/тегов/клиентов, индикатор «Ограниченный круг» + список зрителей.
- Диалог `DecisionDialog` с: текст, дата, мульти-выбор проектов (`ProjectPicker`), мульти-выбор тегов (`TagPicker`), мульти-выбор клиентов (`ClientPicker`), переключатель видимости + `MultiAssigneePicker` для круга лиц.

**2. PMO (`/pmo`)**
- В `ExpandedProjectDashboard` (раскрытая карточка) — секция «Решения» рядом с Overdue/Upcoming/Drift. Источник: `decisions` где `group_id` ∈ scopeIds (проект + дети + внуки). Группировка: текст + чипы протокола (откуда), даты, кнопка «Открыть протокол».
- В `ProjectDetailPanel` (футер карточки проекта) — компактный список последних 5 решений + ссылка «Все решения».

**3. CRM (`/crm`)**
- В `CrmBoard`/карточке клиента — секция «Решения по клиенту»: запросы по `decision_clients.client_id`. Показ: заголовок, дата, протокол-источник.

**4. Глобально**
- В `ProjectDetailPanel` уже есть зона футера — добавим под создателем «N решений» с поповером.
- Хук `useDecisions({ protocolId?, groupId?, clientId?, tagIds? })` — единая точка чтения.

## Технические детали

- Миграция: создать таблицы + RLS + функцию `can_see_decision` (`SECURITY DEFINER`, `STABLE`, `search_path=public`).
- Триггер `update_updated_at_column` на `decisions`.
- Индексы: `decisions(protocol_id)`, `decision_projects(group_id)`, `decision_clients(client_id)`, `decision_tags(tag_id)`.
- Realtime: добавить `decisions`, `decision_*` в `supabase_realtime`.
- TS-хуки: `useDecisions`, `useCreateDecision`, `useUpdateDecision`, `useDeleteDecision` в `src/hooks/useDecisions.tsx`.
- Компоненты: `src/components/decisions/DecisionDialog.tsx`, `DecisionCard.tsx`, `DecisionsSection.tsx`.
- Интеграция: новые секции в `ProtocolDetailPage`, `ExpandedProjectDashboard` (PMO), `CrmBoard`, `ProjectDetailPanel`.

## Этапы

1. **Миграция БД** — таблицы, RLS, функция, индексы, realtime.
2. **Хуки + диалог** — CRUD, форма с пикерами проектов/тегов/клиентов/зрителей.
3. **Секция «Решения» в протоколе** — отдельная вкладка + кнопка в раскрытой строке.
4. **Интеграция в PMO** — секция в `ExpandedProjectDashboard` + сводка в футере `ProjectDetailPanel`.
5. **Интеграция в CRM** — секция «Решения по клиенту» на карточке клиента.
6. **Memory** — обновить `mem://index.md` и завести `mem://features/decisions.md`.

Начать с миграции (Этап 1) — после её одобрения сразу пойдут хуки и UI.