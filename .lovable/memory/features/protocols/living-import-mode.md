---
name: Living import mode
description: Отдельный living-промпт в parse-protocol-text + ветка импорта в ProtocolImportDialog (mode + post-process).
type: feature
---

## Living-режим импорта протокола

Импорт «📖 Живого документа» использует отдельный воркфлоу — не путать с formal-протоколами
(cross_functional / client_negotiation / npd_gate).

### Edge-функция `parse-protocol-text`
Принимает `body.mode = "living" | "formal"` (default: formal).
- **formal**: ищет нумерованные блоки, таблицы поручений, эмодзи перед заголовками.
- **living**: группирует свободные заметки по 1-6 СМЫСЛОВЫМ темам с тезисами-выводами.
  - `sections[].topic` — короткое существительное (1-5 слов), без эмодзи и нумерации.
  - `sections[].icon` — обязательное эмодзи к теме.
  - `sections[].summary` — 2-5 markdown-буллетов через \n (это и есть «выводы по теме»).
  - `sections[]` всегда непустой; задачи извлекаются мягко («договорились»→«Подготовить»).
  - Каждой задаче проставляется axes.event_topic = sections[].topic.

### Клиент `ProtocolImportDialog`
- В parseMutation.body.mode передаётся режим в зависимости от выбранного шаблона.
- В parsedMode запоминается, каким режимом разобрали — при mismatch с шаблоном
  показывается жёлтый бейдж «Перепарсить» (повторный вызов с новым mode).
- Чекбокс «Сохранить выводы блочно» для living скрыт — выводы блочно ВСЕГДА.
- createMutation, блок 3.0: для living гарантируем axes.event_topic у каждой задачи
  — если AI забыл, восстанавливаем по sections[].task_indices.
- Блок 3.7 (topic_notes в protocol_meta) для living не зависит от чекбокса.
- guessTemplate возвращает living по умолчанию, если документ выглядит свободно
  (нет таблиц | … |, нет ## N. заголовков, секций < 3).
