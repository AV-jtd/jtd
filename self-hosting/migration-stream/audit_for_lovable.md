# Запрос к Lovable: точная схема объектов, созданных вручную

## Контекст

Переносим JustTODOit с облака Lovable на собственный сервер (self-hosted
Supabase). Схему БД восстанавливали из `supabase/migrations/*.sql`, но
обнаружили: **часть объектов БД была создана вручную через SQL-редактор
Lovable в обход миграций** — их нет ни в одной ветке git.

Самый ранний пример: миграция от 28.02 уже делает
`ALTER TABLE tasks ADD COLUMN client_id REFERENCES public.clients(id)` —
то есть таблица `public.clients` к тому моменту **уже существовала**, но
её `CREATE TABLE` нигде в миграциях нет.

Поэтому на self-hosted эти объекты отсутствуют, и фронтенд получает
404/406 при обращении к ним.

## Что нужно от вас

Точный DDL этих объектов **из живой облачной БД** (через `information_schema`
/ `pg_catalog` — прямой доступ к БД не требуется, достаточно SELECT-запросов,
которые вы уже умеете выполнять).

Для каждого отсутствующего объекта нужно:

### Для таблиц
- `CREATE TABLE` со всеми колонками, типами, `DEFAULT`, `NOT NULL`
- Первичный ключ, уникальные ограничения
- Внешние ключи (`REFERENCES`)
- Индексы
- RLS-политики (`CREATE POLICY ...`) и `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Триггеры, если есть

Готовый способ получить структуру колонок:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clients'
ORDER BY ordinal_position;
```

RLS-политики:
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'clients';
```

### Для функций (RPC)
- Полный `CREATE OR REPLACE FUNCTION` (сигнатура + тело)
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = '<имя_функции>' AND pronamespace = 'public'::regnamespace;
```

## Список отсутствующих объектов

> Заполняется по результату аудита self-hosted (греп фронтенда по
> `.from('...')` / `.rpc('...')` минус то, что реально есть в БД).

### Таблицы (подтверждённые)
- [ ] `public.clients`
- [ ] `public.task_step_templates`

### Колонки
- [ ] `tasks.project_type` (тип и default)

### Ещё под вопросом (уточним после грепа фронтенда)
- [ ] _список дополняется_

## Формат ответа

Один SQL-файл `missing-objects.sql`, который можно выполнить на self-hosted
БД, в порядке зависимостей (родительские таблицы раньше дочерних). Данные
не нужны — только структура (DDL). Данные заберём отдельным свежим
CSV-экспортом.
