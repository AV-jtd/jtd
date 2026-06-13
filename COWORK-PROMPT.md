# Промпт для co-work сессии: улучшения архитектуры JTD

Вставь этот промпт в новую сессию Claude Code (браузер, claude.ai/code).

---

## Промпт (копировать целиком)

```
Репозиторий: AV-jtd/jtd, ветка claude/modest-hawking-sfszra.
Приложение JTD — task-менеджер (React + Supabase self-hosted).

Мы ведём параллельный план улучшений архитектуры. Часть уже сделана:
  ✅ п.1 — self-hosting/backup/         (бэкапы PostgreSQL с ротацией)
  ✅ п.2 — self-hosting/storage/        (S3-бэкенд для файлов)

Полный план улучшений (из анализа архитектуры):

  п.3 — Составные индексы на tasks и task_comments (HIGH приоритет)
         Ускорят основные выборки: по assignee+status, group+created,
         task+created. Откат: DROP INDEX CONCURRENTLY.

  п.4 — PgBouncer connection pooling (MEDIUM)
         PostgREST сейчас открывает соединение на каждый запрос.
         При 50+ юзерах PostgreSQL захлёбывается.
         Откат: убрать сервис из compose.

  п.5 — Партиционирование task_comments по дате (после 500K строк)
         PARTITION BY RANGE (created_at) — ежегодные партиции.
         Откат: merge партиций обратно.

  п.6 — Мониторинг Prometheus + Grafana
         postgres-exporter + дашборды: размер таблиц, bloat, connections.
         Откат: docker compose stop monitoring.

  п.7 — Разбивка useTasks.tsx (104KB монолит)
         Разделить на hooks/tasks/: useTaskCRUD, useTaskFilters,
         useTaskRealtime, useTaskDependencies.
         Откат: git revert.

Правила работы:
- Каждый пункт = отдельный коммит в ветку claude/modest-hawking-sfszra
- Каждый пункт содержит: изменение + тест/проверка + инструкция отката
- Перед необратимыми изменениями в схеме БД — стоп и подтверждение
- После каждого пункта — краткое резюме что сделано

Начни с п.3: прочитай суперфайл src/hooks/useTasks.tsx чтобы понять
какие запросы к tasks и task_comments там есть, потом создай SQL-миграцию
с составными индексами + скрипт проверки (EXPLAIN ANALYZE до/после).
```

---

## Контекст по стеку (если нужен быстрый ответ без чтения кода)

- **БД**: PostgreSQL 15 (supabase/postgres образ) с RLS
- **API**: PostgREST v12 → Supabase Kong → клиент
- **Клиент**: React + TanStack Query, stale time 5 мин
- **Основной монолит**: `src/hooks/useTasks.tsx` — 104KB, все запросы к tasks
- **Индексы**: базовые есть (PK, FK), составных под реальные query-паттерны нет
- **Self-hosted файлы**: `self-hosting/docker-compose.supabase.yml`
- **Миграции**: `supabase/migrations/` — 40+ файлов

## Отдельный стрим: переезд на РФ-сервер

Параллельно идёт переезд на российский VPS. Его план — в
`self-hosting/migration-stream/`. Он не пересекается с улучшениями архитектуры,
но пункты 1–2 уже сделаны именно для него.
```
