---
name: Protocol — partner side & CRM linking
description: Колонка ответственных в протоколе текстом с разделением на наших и партнёра. Привязка протокола к CRM-клиенту (auto-match по названию + ручной picker), наследование client_id в задачи, контакт CRM-клиента доступен в picker партнёра.
type: feature
---

# Протоколы: сторона партнёра + связь с CRM

## Хранение
- `task_groups.protocol_meta.client_id` (uuid) — ссылка на `clients.id`
- `tasks.client_id` — наследуется при создании задач из протокола
- `tasks.external_assignee` (jsonb): `{ name, organization?, role? }`. `role: "company"` означает назначение на компанию (без имени); `role: "CRM"` помечает контакт из карточки CRM-клиента.

## ProtocolHeader
- В meta-row рядом с датой/форматом — кнопка-чип «Привязать клиента CRM» (или название клиента если связан).
- Picker `Popover` с поиском по `clients.name` / `contact_name`. Кнопка отвязки.
- **Auto-match**: при наличии `external_attendees[].organization` совпадающего с `clients.name` (case-insensitive) — `client_id` устанавливается автоматически (только если не привязан вручную).

## ProtocolTableView · AssigneePicker
- **Trigger** теперь plain text (без чипа): `"Имя"` для наших, `"Организация · Имя"` для контакта партнёра, `"Организация"` для компании-ответственного, italic `"Назначить"` если пусто.
- Секции в popover:
  - **С нашей стороны** — пользователи команды
  - **Со стороны партнёра — только компания** — уникальные организации из `external_attendees[].organization` + название `linkedClient`. Бейдж `CRM` если из карточки.
  - **Со стороны партнёра — контактное лицо** — объединённый список: `external_attendees` (header) + `linkedClient.contact_name` (если есть и не дублирует header). Источник CRM помечается бейджем.

## Поведение
- Назначение компании: `external_assignee = { name: org, organization: org, role: "company" }`.
- Имя контакта опционально — пользователь может указать только компанию.
- При создании задачи в протоколе `client_id` наследуется из `protocol_meta.client_id` → задачи появляются в CRM-доске (если включен модуль).

## Будущее
- Кнопка «Открыть в CRM» по клику на партнёра-чип в строке (когда добавим).
- Перевод протокол-задач в CRM-воронку по статусам.
