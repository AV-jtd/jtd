---
name: protocol-sides-parsing
description: Парсинг сторон встречи из названия протокола ("Лента x Дороничи" → партнёр=Лента, мы=Дороничи). Авто-привязка партнёра к CRM-клиенту, диалог создания клиента если не найден. Парсенный партнёр доступен в AssigneePicker как «компания».
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

## AssigneePicker
- Получает prop `parsedPartner: string | null`.
- `companies` теперь = uniq{external_attendees.organization} ∪ {linkedClient.name} ∪ {parsedPartner}.
- Это ключ к назначению ответственного-партнёра даже если внешних участников 0 и CRM не привязан — достаточно, чтобы название встречи было распарсено.

## Файлы
- `src/lib/protocolSides.ts` (новый)
- `src/modules/protocols/components/ProtocolHeader.tsx` — чип + диалог + parsedSides auto-match.
- `src/modules/protocols/components/ProtocolTableView.tsx` — пробрасывает `parsedPartner` в `ProtocolRow` → `AssigneePicker`.
