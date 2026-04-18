---
name: JTD 2.0 — UX/UI Roadmap Q1
description: Стрим капитального ремонта UX/UI на Q1. 6 направлений (R1-R6) с приоритетами P0/P1/P2 на основе end-to-end анализа workflow.
type: feature
---

# Стрим JTD 2.0

End-to-end анализ workflow по 5 фазам GTD (Захват → Разбор → План → Исполнение → Ревью) выявил 6 направлений UX/UI доработок. Цель — устранить трение в кросс-модульных переходах, ежедневном workflow и командных сценариях для ролей Исполнитель / PM / NPD-CRM-специалист.

## Workflow Map (артефакт)
- Файл: `JustTODOit_Workflow_Map.mmd` (Mermaid-диаграмма пути задачи от захвата до ретроспективы).
- Узкие места: фаза «Разбор» (нет Триаж-экрана) и «Планирование» (фрагментация интерфейсов проектов в PMO/NPD/CRM).

## Направления Q1

### R1 — Унификация ProjectHeader и переключателя видов (P0)
- Единый компонент `<ProjectHeaderUnified>` для PMO/NPD/CRM/Tasks.
- Tab-bar видов: List / Board / Gantt / Matrix / Funnel / Wiki / Dashboard — доступность по типу проекта.
- Унификация крошек (скрывать префиксы родителя), действий в меню «···», бейджа активного NPD-гейта.

### R2 — Триаж-экран (P0, ⏸ ждёт модель контекста от Артёма)
- Быстрый разбор «сирых» задач из Inbox (без проекта/тегов/дедлайна).
- Связь с `mem://features/triage/context-model-pending`.

### R3 — Weekly Review (P1)
- Новый маршрут `/review` для PM-роли.
- Секции: Закрыто / Дрейф / Ожидают согласования / Риски (PMO+CRM Risk Radar).
- AI-summary сверху (ai-insights edge function).

### R4 — Mobile Task Inspector (P1)
- Bottom Sheet 90dvh + полноэкранный режим.
- Свайп-навигация между задачами в текущем фильтре.
- Целевой viewport 369px (текущая болевая точка).

### R5 — Единая лента уведомлений + объединённый мессенджер (P1)
- Inbox уведомлений (notify-event события) рядом с MessengerPanel.
- Группировка по проекту/задаче, dot-индикаторы непрочитанного.

### R6 — Risk Inbox + возврат Report Builder (P2)
- Risk Inbox: агрегатор PMO Risk Radar + CRM Risk Radar + AI Insights.
- Report Builder из Wiki вернуть в основное меню (сейчас скрыт).

## Контекст (отложенные стримы как зависимости)
- `mem://features/triage/context-model-pending` — блокирует R2.
- `mem://features/offline/performance-analysis-pending` — пересекается с R4 (мобильная производительность).
- `mem://features/outlook/web-addin-stream` — после R1 (единый ProjectHeader упростит интеграцию контекста писем в задачи).

## Следующий шаг
Старт с R1: прототипы `<ProjectHeaderUnified>` + tab-bar видов в 2-3 стилях, выбор направления, реализация.
