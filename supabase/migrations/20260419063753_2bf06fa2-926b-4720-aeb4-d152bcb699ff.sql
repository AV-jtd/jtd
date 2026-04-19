
-- Шаг 1. Удалить дубли клиентов в пределах одного user_id (case-insensitive по name).
-- Самая ранняя запись — каноническая. Перевешиваем ссылки tasks.client_id и protocol_meta.client_id.

WITH dup AS (
  SELECT
    id,
    user_id,
    lower(name) AS lname,
    ROW_NUMBER() OVER (PARTITION BY user_id, lower(name) ORDER BY created_at ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY user_id, lower(name) ORDER BY created_at ASC) AS canonical_id
  FROM clients
),
remap AS (
  SELECT id AS old_id, canonical_id AS new_id
  FROM dup
  WHERE rn > 1
)
UPDATE tasks t
SET client_id = r.new_id
FROM remap r
WHERE t.client_id = r.old_id;

-- Перевешиваем привязки протоколов
WITH dup AS (
  SELECT
    id,
    user_id,
    lower(name) AS lname,
    ROW_NUMBER() OVER (PARTITION BY user_id, lower(name) ORDER BY created_at ASC) AS rn,
    FIRST_VALUE(id) OVER (PARTITION BY user_id, lower(name) ORDER BY created_at ASC) AS canonical_id
  FROM clients
),
remap AS (
  SELECT id AS old_id, canonical_id AS new_id
  FROM dup
  WHERE rn > 1
)
UPDATE task_groups g
SET protocol_meta = jsonb_set(g.protocol_meta, '{client_id}', to_jsonb(r.new_id::text), true)
FROM remap r
WHERE g.protocol_meta->>'client_id' = r.old_id::text;

-- Удаляем дубли
WITH dup AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id, lower(name) ORDER BY created_at ASC) AS rn
  FROM clients
)
DELETE FROM clients c
USING dup
WHERE c.id = dup.id AND dup.rn > 1;

-- Шаг 2. Уникальный индекс case-insensitive в пределах user_id
CREATE UNIQUE INDEX IF NOT EXISTS clients_user_lower_name_uniq
  ON public.clients (user_id, lower(name));
