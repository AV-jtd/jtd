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

После INSERT задач выполняется привязка тем (event_topic):
1. Уникальные axes.event_topic → найти/создать категорию event_topic пользователя
2. Найти/создать теги в этой категории (case-insensitive)
3. Авто-линк: если есть открытый task_group с тем же именем (и нет linked_tag_id) — записать tag.id в linked_tag_id
4. INSERT task_tags для всех задач с темой

Когда в строке протокола пользователь привязывает «проект» (status_meta.linked_project_id),
и у проекта есть linked_tag_id из категории event_topic — этот тег автоматически проставляется
как тема задачи (старые event_topic-теги снимаются, чтобы тема была одна).

Текстовый flow (paste/.txt) сохранён без изменений.
