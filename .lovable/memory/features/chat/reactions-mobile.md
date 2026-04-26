---
name: Реакции на сообщения — мобильная версия
description: Кнопка добавления реакции (ReactionAddButton) вынесена в строку метаданных сообщения (рядом с автором/временем/чипами реакций), а не в плавающий action-bar. Так она всегда видна на мобильном и не конкурирует с другими кнопками за 80px ширины. На мобильном автофокус инпута поиска эмодзи отключён, чтобы клавиатура не закрывала popover.
type: feature
---

# Реакции на сообщения — особенности мобильной версии

## Архитектура

В `ProjectChat.MessageBubble` и `TaskChat` действия над сообщением разделены на 2 группы:

1. **Inline-блок в строке метаданных** (всегда виден):
   - `ReactionChips` — существующие реакции (👍 3, ❤️ 1)
   - `ReactionAddButton` (Smile-иконка в рамке) — открывает попап выбора эмодзи

2. **Плавающий action-bar** (absolute, скрыт на десктопе до hover):
   - CheckSquare — создать задачу из сообщения
   - Reply — ответить
   - Trash2 — удалить (только своё)

## Почему так

Раньше ReactionAddButton стоял первой кнопкой в плавающем action-bar. На мобиле action-bar резервировал ~80px (pr-20), но 4 кнопки не влезали и Smile обрезался/перекрывался ReactionChips. Юзер видел CheckSquare/Reply/Trash, но не видел Smile во всех чатах.

Перенос в строку метаданных решает это структурно: реакция — не «второстепенное действие», а основное взаимодействие.

## Особенности ReactionAddButton

- Стиль: h-6 w-6, border border-border/60 bg-background/60 — кнопка отделяется от фона сообщения
- Иконка Smile h-3.5 w-3.5 (увеличена с h-3 w-3)
- На мобильном (useIsMobile()):
  - onOpenAutoFocus prevent на PopoverContent
  - autoFocus={false} на инпуте поиска
  - Иначе Android Chrome / iOS Safari поднимают клавиатуру → viewport ужимается → Radix Popover закрывается

## Файлы

- src/components/MessageReactions.tsx
- src/components/ProjectChat.tsx (MessageBubble)
- src/components/TaskChat.tsx

## Не делать

- Не возвращать ReactionAddButton в плавающий action-bar — будет невидим на мобиле
- Не ставить autoFocus инпуту поиска без проверки useIsMobile() — клавиатура убивает popover
