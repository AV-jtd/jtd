---
name: CRM clients — dedup & «+ Создать клиента» из протокола
description: Уникальность клиентов CRM по (user_id, lower(name)). Дубли смержены, ссылки задач/протоколов перевешены на canonical. В пикере клиента в шапке протокола можно создать запись CRM без шагов воронки — шаги появляются только при DnD по этапам.
type: feature
---

# CRM clients: дедуп и создание из протокола

## БД
- `clients`: уникальный частичный индекс `clients_user_lower_name_uniq ON (user_id, lower(name))`.
- Миграция merge: при наличии дублей в пределах одного `user_id` (case-insensitive по `name`) самая ранняя запись — каноническая. `tasks.client_id` и `task_groups.protocol_meta.client_id` перевешиваются на canonical перед `DELETE`.

## UI: ProtocolHeader (пикер CRM-клиента)
- `dedupedClients` дополнительно режет дубли в UI (на случай старых данных или одинаковых имён у разных юзеров команды).
- Кнопка **«+ Создать клиента»** в нижней части пикера:
  - Если в поиске введено имя, которого нет среди существующих — кнопка `«Создать клиента "<запрос>"»`, авто-привязка к протоколу (`autoLinkAfterCreate=true`).
  - Иначе — кнопка `«Добавить клиента в CRM»`, диалог с пустым именем, **без** авто-привязки.
- Перед INSERT — повторная проверка `namesEqual` против списка `clients`: если уже существует, привязываем (или сообщаем info), без ошибки unique-violation.

## Важно: шаги воронки CRM
- Создание карточки `clients` **никогда** не создаёт subtasks.
- Шаги (Отправить КП → Образцы → ОС → Переговоры → Старт отгрузок) появляются ТОЛЬКО при DnD карточки задачи по колонкам в `CrmBoard.moveMutation` (`SUBTASK_STAGE_MAP` / `CRM_STAGE_TEMPLATE`).

## Файлы
- `src/modules/protocols/components/ProtocolHeader.tsx` — пикер + диалог + `createClient()` универсальный.
- Миграция: dedup + unique index `clients_user_lower_name_uniq`.
