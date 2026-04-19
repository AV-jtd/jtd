---
name: project-icon-system
description: Унифицированная иконка проекта/группы. Приоритет logo_url → emoji (group.icon) → инициал/цвет. logo_url из task_groups автоматически становится иконкой везде в UI (сайдбар, шапки, карточки PMO/NPD/CRM, дашборд). Аналогично clients.logo_url показывается в CRM как ClientAvatar.
type: design
---

# Унифицированные иконки проектов и клиентов

## Логика приоритетов
1. **`task_groups.logo_url`** (картинка) — если задан, используется везде вместо эмоджи.
2. **`task_groups.icon`** (emoji) — fallback. Спец. значение `"list"` = «без эмоджи».
3. **Инициал из `name`** или цветной квадратик (для карточек/sidebar).

## Компоненты
- `src/components/ProjectIcon.tsx` — универсальный, размеры `xs|sm|md|lg|xl`, с поддержкой `logo_url`.
- `src/components/sidebar/GroupIcon.tsx` — обёртка ProjectIcon size=sm для сайдбара.
- `src/components/ClientAvatar.tsx` — для CRM-клиентов (`clients.logo_url`), размеры `xs|sm|md|lg`. Fallback — Building2 / инициал.

## Обновлённые места отображения
- **Сайдбар** (`AppSidebar` → `GroupIcon`).
- **Шапка проекта** (`ProjectHeader.tsx`).
- **Шапка протокола** (`ProtocolHeader.tsx`) — уже была, инлайн.
- **Список протоколов** (`ProtocolsList.tsx`) — карточки 10×10.
- **Карточки подпроектов** (`SubprojectCards.tsx`).
- **Дашборд** (`DashboardView.tsx`) — две точки (проект + sub).
- **NPD карточки** (`NpdBoard.tsx`) — внутри NpdProjectCard и NpdSubprojectCard.

## Где НЕ обновлено (намеренно)
- `BulkTaskDialog` SelectItem — текстовый дропдаун, эмодзи + название достаточно.
- `TaskItem` бейджи проектов — эмоджи остаются как компактный маркер.
- `CrmBoard` метки проектов в карточках задач — низкий приоритет.

## Бакеты
- `protocol-logos` (public) — для `task_groups.logo_url` и `clients.logo_url`.
