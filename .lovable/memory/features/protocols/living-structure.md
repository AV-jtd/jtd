---
name: Living protocol — структура и шапка
description: Минималистичная шапка LivingProtocolHeader, выводы по темам в protocol_meta.topic_notes
type: feature
---

## Living-протокол: реализованная структура

**Шапка** (`LivingProtocolHeader.tsx`) для `template_system_key === "living"`:
- Название (inline-редактирование)
- Дата встречи (popover с date input → meta.meeting_date)
- Контекст: один проект (meta.context_project_id) — задачи протокола можно «приписать» к проекту
- Участники: union(автор. исполнители задач, manual) − excluded, с avatar/инициалами
- Бейдж «Черновик» если is_draft
- НЕТ: логотипов, our_side/partner, внешних участников, формата встречи

**Выводы по теме** (`TopicNotesBlock.tsx`):
- Хранятся в `protocol_meta.topic_notes[tag_id]` как markdown-строка
- Рендерится над таблицей задач каждой темы (только для living)
- Поддерживает буллеты `- ` / `* ` / `• `
- Inline-редактор: клик «Добавить выводы по теме» → textarea → ⌘↵/Save или Esc/Cancel
- Пустые ключи удаляются из meta автоматически

**Использование в ProtocolDetailPage**:
- isLiving → `<LivingProtocolHeader>`, остальные → `<ProtocolHeader>`
- Для living скрыт `<ProtocolSummary>` (он рассчитан на внешние)
- `<ProtocolInternalSection>` и `<CrmReportPlaceholder>` уже скрывались для living раньше

**Референс-формат** (см. PDF "Протокол_Китай"):
```
ПРОТОКОЛ СОВЕЩАНИЯ
Дата · Контекст · Участники

## 1. Тема
Основные выводы:
  - буллет
  - буллет
| Задача | Ответственный | Срок |

✅ Итоговое решение (опц.) — пока пишется в общем description
```

**Ещё не сделано** (отложено на следующий заход):
- Печать living как Google Doc в ProtocolPreviewDialog
- Excel/PDF/текст импорт с сохранением блочной структуры (тема в A, задачи ниже)
