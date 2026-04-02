
-- Remove duplicate/conflicting gate tags on tasks
-- For each task that has multiple gate tags, keep only the one with the highest gate number
WITH gate_tag_ids AS (
  SELECT id, name,
    CASE
      WHEN name = 'Gate 5: Анализ запуска' THEN 5
      WHEN name = 'Gate 4: Запуск' THEN 4
      WHEN name = 'Gate 3: Подготовка к запуску' THEN 3
      WHEN name = 'Gate 2: Разработка и Валидация' THEN 2
      WHEN name = 'Gate 1: Концепция и Экономика' THEN 1
      WHEN name = 'Gate 0: Идея и Стратегия' THEN 0
    END as gate_num
  FROM tags
  WHERE name LIKE 'Gate %'
),
task_gate_tags AS (
  SELECT tt.task_id, tt.tag_id, g.gate_num,
    ROW_NUMBER() OVER (PARTITION BY tt.task_id ORDER BY g.gate_num DESC) as rn
  FROM task_tags tt
  JOIN gate_tag_ids g ON g.id = tt.tag_id
),
to_delete AS (
  SELECT task_id, tag_id FROM task_gate_tags WHERE rn > 1
)
DELETE FROM task_tags
WHERE (task_id, tag_id) IN (SELECT task_id, tag_id FROM to_delete);
