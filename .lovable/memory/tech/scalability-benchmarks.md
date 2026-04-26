---
name: scalability-benchmarks
description: Бенчмарки производительности RLS после оптимизации (апр 2026) и план масштабирования до 1000+ пользователей
type: feature
---

# Производительность и масштабирование

## Текущие замеры (после RLS-оптимизации, апр 2026)

| Роль | Пример | Видимых задач | Время загрузки | Причина |
|---|---|---|---|---|
| Admin | Артём | 5 347 | ~7 мс | `has_role('admin')` short-circuit, пропускает все фильтры |
| Director | Журавлёва | 95 | ~5 мс | Узкая зона (1-2 отдела/31 группа) |
| Power user | Кулябина | 556 | ~53 мс | Широкая зона (89 проектов/263 участия) |

До оптимизации тяжёлые юзеры таймаутились (>8 с). Сейчас улучшение в ~150 раз для широкой видимости.

## Что сделано
- Inline-подзапросы (`IN (SELECT ...)`) вместо `ANY(array_function())` в политиках tasks/subtasks → hashed SubPlan
- Индексы: `idx_tasks_user_id`, `idx_tasks_assigned_to`, `idx_tasks_group_id`, `idx_task_groups_user_id`, `idx_group_members_user_id`, `idx_user_departments_user_id`
- Миграция: `20260426155747_*.sql`

## Готовность по объёмам

| Порог | Действие |
|---|---|
| 100-200 активных | ✅ Уже готово (RLS + индексы + виртуализация + пагинация) |
| 200+ | Materialized view для `user_visible_groups_arr` (refresh раз в минуту) |
| 500+ | Read-replica для аналитики (ИИ-инсайты, weekly-report) |
| 1000+ | Connection pooling tuning + партиционирование `tasks` по `user_id` |

## Узкие места НЕ в RLS
1. Лимит Supabase 1000 строк/запрос → паттерн пагинации (см. `mem://tech/supabase-query-pagination-pattern`)
2. Realtime-каналы при 100+ онлайн → singleton `channelManager`
3. Frontend-рендер длинных списков → `VirtualTaskList`
4. Edge Functions concurrency → ~100 параллельных вызовов на функцию

## Принципы оптимизации RLS
- Избегать `ANY(function_returning_array())` — Postgres не использует индексы
- Предпочитать `IN (SELECT ...)` — план получается через hashed SubPlan
- Для admin/director держать ранний выход через `has_role` в начале политики
- После добавления индексов запускать `ANALYZE` на затронутых таблицах