---
name: subtasks task_id index
description: Critical index on subtasks(task_id) for useTasks LATERAL join — без него таймауты у активных юзеров.
type: feature
---
В `subtasks` ОБЯЗАТЕЛЕН индекс `idx_subtasks_task_id` на колонке `task_id`. Главный запрос `useTasks` (PostgREST `tasks?select=*,subtasks(*),task_tags(tag_id)`) выполняет LATERAL join — без индекса делает Seq Scan по subtasks для каждой задачи (O(N²)) и упирается в statement_timeout у пользователей с большим RLS-доступом. При добавлении новых таблиц-«детей» к `tasks` всегда создавать индекс по FK `task_id`.

Также: на `task_participants(task_id, user_id)` должен быть РОВНО ОДИН unique constraint (`task_participants_task_id_user_id_key`) — дубликаты замедляют записи.
