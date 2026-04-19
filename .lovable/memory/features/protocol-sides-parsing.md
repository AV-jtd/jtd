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
- Два блока 2-в-ряд **без лейблов** «НАША СТОРОНА»/«ПАРТНЁР» — только имена сторон крупно: «Дороничи» / «Лента» (мелкая подпись «Наша сторона» под именем для контекста).
- **Три автономных слота логотипов** (важно — не пересекаются):
  1. **Заголовок** (top-left иконка 14×14) → `task_groups.logo_url`. Используется как иконка проекта/протокола везде в UI (сайдбар, карточки).
  2. **Наша сторона** (12×12 в карточке) → `protocol_meta.our_logo_url` (per-protocol). Дефолт = `src/assets/our-logo-default.jpg` (Дороничи), показывается когда `our_logo_url === null`. Кнопка «X» сбрасывает к дефолту.
  3. **Партнёр** (12×12 в карточке) → `clients.logo_url`. Подгружается из CRM, при загрузке обновляет CRM-карточку клиента.
- **Кастомные участники партнёра**: чипы из `protocol_meta.external_attendees[].name` прямо в карточке партнёра + popover «+ участник» с inline-инпутом. Удаление — крестиком на чипе при hover. Дедуп по lower(name).
- Контактное лицо CRM-клиента — мелкой строкой под названием.
- Поле `clients.logo_url` (text, nullable) — миграция `20260419_clients_logo`.

## AssigneePicker
- Получает prop `parsedPartner: string | null`.
- `companies` теперь = uniq{external_attendees.organization} ∪ {linkedClient.name} ∪ {parsedPartner}.

## Файлы
- `src/lib/protocolSides.ts` (новый)
- `src/modules/protocols/components/ProtocolHeader.tsx` — карточки сторон + загрузка логотипа партнёра.
- `src/modules/protocols/components/ProtocolTableView.tsx` — пробрасывает `parsedPartner` в `ProtocolRow` → `AssigneePicker`.
