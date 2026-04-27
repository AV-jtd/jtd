---
name: protocol-pdf-multimodal-import
description: PDF протокола → Gemini multimodal (без pdfjs). Секции, теги тем, заметки в описание группы.
type: feature
---
Импорт PDF-протоколов идёт multimodal: файл целиком (base64) шлётся в google/gemini-2.5-pro через
edge-функцию parse-protocol-text. Это сохраняет таблицы | Задача | Ответственные | Срок |, эмодзи,
выделения <mark>, OCR для сканов.

Edge возвращает:
- rows[]: задачи с axes.event_topic = название секции
- sections[]: { topic, icon, summary, task_indices } — нумерованные блоки протокола
- assignee_hints[]: массив имён ответственных (если их несколько); первое имя дублируется в assignee_hint

UI:
- pdfFile хранится отдельно от text; при наличии PDF body = { pdf_base64, pdf_mime }
- На шаге Template показываем найденные секции + чекбокс "Сохранить выводы секций в описание протокола"
- При создании группы: если флаг включён, выводы секций добавляются в task_groups.description как
  "## Темы протокола \n ### emoji topic \n summary"
- В RowCard auto-маппинг hints[1..] на participant_ids (один раз, если participants пусты)

Текстовый flow (paste/.txt) сохранён без изменений.
