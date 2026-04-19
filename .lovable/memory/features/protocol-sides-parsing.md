---
name: protocol-sides-parsing
description: Парсинг сторон встречи из названия протокола ("Лента x Дороничи" → партнёр=Лента, мы=Дороничи). Авто-привязка партнёра к CRM-клиенту, диалог создания клиента если не найден. В шапке протокола вместо «Внутренние/Внешние участники» — две карточки сторон с логотипами (наш logo_url из task_groups + clients.logo_url партнёра). Парсенный партнёр доступен в AssigneePicker как «компания».
type: feature
---

# Парсинг сторон протокола из названия

## Контракт
- `src/lib/protocolSides.ts` — `parseProtocolSides(title)` возвращает `{ partner, ours }` или `null`.
- Разделители: ` x `, ` × `, ` vs `, ` — `, ` – `, ` / ` (case-insensitive, требует пробелов вокруг).
- **Договорённость**: ВТОРАЯ часть = наша сторона, ПЕРВАЯ = партнёр.
- `namesEqual(a, b)` — case-insensitive trim сравнение.

## Поведение в ProtocolHeader
- Чип сторон рядом с CRM-link: «✨ Лента × Дороничи». Стиль — серый, если партнёр в CRM найден; жёлтый с кнопкой «+ В CRM» — если нет.
- **Auto-match priority**:
  1. По `parsedSides.partner` против `clients.name` (case-insensitive).
  2. Fallback — по `external_attendees[].organization`.
- **Диалог создания клиента** (`AlertDialog`): кнопка «+ В CRM» в чипе → диалог с input (предзаполнен `parsedSides.partner`) → INSERT в `clients` + UPDATE `task_groups.protocol_meta.client_id`.

## Карточки сторон (вместо «Внутренние/Внешние участники»)
- Два блока 2-в-ряд: «Наша сторона» (sides.ours + protocol.logo_url) и «Партнёр» (linkedClient.name + clients.logo_url).
- Если CRM не привязан — показывается parsed `sides.partner` + кнопка «+ Добавить в CRM».
- Внутренние участники (ответственные по задачам) — компактные аватарки в нижней части блока «Наша сторона» (до 4, дальше +N).
- Контактное лицо CRM-клиента — мелкой строкой под названием партнёра.
- Логотип партнёра редактируется (upload/удаление) через хвостовые иконки в углу аватара. Бакет — `protocol-logos`, поле `clients.logo_url`.
- Поле `clients.logo_url` (text, nullable) — миграция `20260419_clients_logo`.

## AssigneePicker
- Получает prop `parsedPartner: string | null`.
- `companies` теперь = uniq{external_attendees.organization} ∪ {linkedClient.name} ∪ {parsedPartner}.

## Файлы
- `src/lib/protocolSides.ts` (новый)
- `src/modules/protocols/components/ProtocolHeader.tsx` — карточки сторон + загрузка логотипа партнёра.
- `src/modules/protocols/components/ProtocolTableView.tsx` — пробрасывает `parsedPartner` в `ProtocolRow` → `AssigneePicker`.
