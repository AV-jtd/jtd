---
name: R7 — Meeting Protocols (Протоколы совещаний)
description: Стрим JTD 2.0 R7. Протокол = проект (project_type='protocol'), строки = задачи. Table View в стиле Mission Control с метриками-смарт-фильтрами и сортируемыми колонками-фильтрами. Inline-раскрытие через ProjectDetailPanel.
type: feature
---

# R7 — Meeting Protocols

## Модель данных (без новых сущностей)
- Протокол = `task_groups` с `project_type = 'protocol'`.
- Строка протокола = обычная `tasks` (наследует drift/Baseline Lock, чат, делегирование, шаги, теги, участники).
- Информируемые = `task_participants` с role='observer'.
- Решения = существующее поле `closure_result`.
- Блок вопроса / Площадка = `tag_categories` (категории тегов).
- **risk_level НЕ добавляем** — есть `is_important` (звезда) и AI Risk Radar.
- Статусы маппим на существующее: действующая=open, закрыта=is_completed, отменена=cancelled (новый bool позже если потребуется), отложена=deferred_until.

## Шаблоны (4 типа)
1. Стандартный протокол совещания
2. Протокол с площадками (доп. категория тегов «Площадка»)
3. Протокол переговоров (категория «Контрагент», поле для решения обязательно)
4. Протокол ревью (категория «Артефакт ревью», обязательны шаги-чек-лист)

## UI: Table View (Mission Control style — выбран)
**Шапка:**
- Унифицированный `ProjectHeaderUnified` (R1) с табами: **Таблица / Список / Чат / Wiki**.
- Бейдж Baseline Lock, кнопки «Экспорт», «Поделиться».

**Метрики-смарт-фильтры (top bar, 4 карточки):**
- Всего / В работе / Просрочено / Завершено.
- Клик по карточке = применить смарт-фильтр + подсветка активной карточки indigo.
- Расширяется до 6-8 карточек по мере необходимости (Drift, Без ответственного, Сегодня).

**Таблица:**
- Колонки: №, Наименование (+ хлебные крошки `Project / Subproject`), Блок, Площадка, Ответственный, Информированы (avatar stack), Срок (overdue ⚠ red, drift ↗ amber dashed), Статус (checkbox), ···.
- **Каждый заголовок = сортировщик (▲▼)** + иконка-фильтр (multi-select значений).
- Sticky header при скролле.
- Inline `+ Добавить строку` снизу.

**Раскрытие строки:**
- Клик по строке = inline expand (как в PMO Dashboard / Wiki).
- Используем `ProjectDetailPanel` в inline-режиме: описание, шаги, решения (`closure_result`), thread комментариев справа, поле «Написать комментарий».

## Workflow
1. **Создание протокола** — из шаблона или импорт `.xls` через существующий `SmartImportDialog` (пресет «Протокол»). Опция: подтянуть незакрытые строки из прошлого протокола (клон + drift по `original_deadline`).
2. **Встреча** — секретарь в Table View: inline-ввод, Tab между ячейками, назначение ответственного/срока/тегов.
3. **Исполнение** — строки видны исполнителям как обычные задачи (Inbox, Calendar, Telegram).
4. **Контроль** — попадание в Weekly Review (R3): закрыто / drift / просрочено. AI Risk Radar — авто.
5. **След. протокол** — кнопка «Создать следующий» = клон с открытыми строками + накопленный drift.

## Зависимости
- R1 (ProjectHeaderUnified) — желательно сначала, чтобы переиспользовать шапку.
- Импорт `.xls` использует существующий `SmartImportDialog`.
- Drift/Baseline Lock уже работает.

## Статус
- **Этап 1 ✅** — пункт меню в Дашбордах (без сайдбара/шапки), `/protocols` со списком.
- **Этап 2 ✅** — таблица `protocol_templates` (4 системных шаблона), диалог `NewProtocolDialog` (wizard: шаблон → детали).
- **Этап 3 ✅** — `ProtocolTableView` и `ProtocolDetailPage` (роут `/protocols/:id`): метрики-смартфильтры (Всего/В работе/Просрочено/Завершено/Без отв.), сортируемые колонки с фильтрами (Ответственный, Срок, Статус), inline-ввод строки, инлайн-редактирование названия/срока/ответственного, раскрытие строки (Описание + Решение через `closure_result`), Drift/Overdue индикаторы. Решения: dropdown ответственного с поиском, native date picker через `showPicker()`, expanded row через дополнительную `<tr>`.
- **Этап 4 ✅** — Импорт PDF/текста через ИИ (`ProtocolImportDialog` + edge function `parse-protocol-text`): drag&drop PDF (pdfjs-dist через CDN worker) или вставка текста → Lovable AI (Gemini 2.5 Flash + tool calling) извлекает rows с title/description/assignee_hint/deadline/axes + meeting_title/date/participants/summary. 3 шага: input → выбор шаблона (auto-guess по эвристике client_negotiation/npd_gate/cross_functional) и параметров → ревью строк (чекбоксы, инлайн-правка title/description/срока, авто-матчинг ответственных по фамилии в `useAvailableUsers`, удаление). При создании: `task_groups` (project_type='protocol') + bulk insert tasks с markdown-таблицей осей в description. Excel-импорт идёт через существующий SmartImportDialog.
