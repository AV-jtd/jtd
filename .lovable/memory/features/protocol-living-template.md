---
name: Protocol Living template
description: Системный шаблон протокола `living` (📖 Живой документ) — каждая строка inline-разворачивается в полноценный TaskItem; авто-группировка по теме всегда включена.
type: feature
---

В системе есть 5 системных шаблонов протоколов (`protocol_templates.system_key`): `cross_functional`, `client_negotiation`, `npd_gate`, **`living`**, `blank` (в этом порядке через `position`). Шаблон сидится через `seed_protocol_templates(_user_id)` и автоматически выдаётся всем новым пользователям через триггер `handle_new_user`.

**Поведение `living` (📖 «Живой документ»)** определяется в `ProtocolTableView` через `isLiving = protocol_meta.template_system_key === "living"`:

1. **Inline-разворот строки** (chevron ▸/▾): вместо стандартных textareas «Описание / Решение» + ExternalRowInternalLayer показывается полноценный `<TaskItem task={task} initialOpen sortable={false} />` — со всеми возможностями (чат, шаги, теги, файлы, AI, приоритет). Контекст таблицы остаётся: компактная строка + раскрытие по требованию.
2. **Авто-группировка по теме**: `groupByTopic` всегда `true`, чип-переключатель скрыт и заменён на info-плашку «Живой документ — авто-группировка по теме». Темы (event_topic-теги) формируют секции-заголовки; новая тема сразу автопривязывается к одноимённому проекту через `useCreateEventTopic` (см. `protocol-topic-as-project`).
3. **Скрытые блоки**: на `ProtocolDetailPage` для `isLiving` НЕ рендерятся `ProtocolInternalSection` и `CrmReportPlaceholder` (они нужны для встреч с внешней стороной, а living — внутренний рабочий документ).
4. **Преемственность между протоколами**: при создании нового living-протокола в `NewProtocolDialog` показывается блок «Подтянуть открытые поручения с прошлых встреч» — те же чипы серий по теме (event_topic) и список прошлых встреч с counter открытых задач. Логика общая для CF и living через флаг `supportsCarryOver = isCrossFunctional || isLiving`. Запрос `prev-protocol-list` фильтрует по `protocol_meta.template_system_key = selected.system_key` (для CF — fallback на префикс имени для legacy-протоколов).

Default columns шаблона: №, «Что обсудили / о чём договорились» (title), Тема, Ответственный, Срок, Статус. Optional axes: `event_topic, site, product_category, brand, clients, department`.
