#!/usr/bin/env bash
# Сверка: видимость задач через множество совпадает с построчной проверкой.
#
# Зачем. Политика на tasks вызывала is_task_visible(id, auth.uid()) построчно и
# стоила 4-8 секунд на запрос (замеры в JOURNAL.md, запись за 27.09.2026).
# Замена на функцию, возвращающую множество, ускоряет в десятки раз, но это
# ГРАНИЦА ДОСТУПА: ошибка здесь открывает чужие данные. Поэтому эквивалентность
# проверяется не на одном пользователе, а на всех.
#
# Что делает. Для каждого пользователя из auth.users строит два множества
# видимых задач — построчной is_task_visible и множественным выражением — и
# сравнивает их в обе стороны. Печатает только расхождения и итог.
#
# Только чтение: временные таблицы внутри транзакции, которая откатывается.
# Идёт долго (около 12 секунд на пользователя) — медленная именно построчная
# сторона, то есть ровно то, что чинится.
#
# Запускать при ЛЮБОЙ правке условий видимости задач: is_task_visible,
# user_visible_task_ids, user_extra_visible_task_ids, политик на tasks и
# subtasks. Ожидаемый результат — «расхождений у 0».
#
# Запуск: bash self-hosting/verify-task-visibility.sh
set -uo pipefail
USERS=$(docker exec self-hosting-db-1 psql -U postgres -d postgres -At -c "SELECT id FROM auth.users ORDER BY id;")
total=0; bad=0
for u in $USERS; do
  out=$(docker exec -i self-hosting-db-1 psql -U postgres -d postgres -At <<SQL
BEGIN;
SET LOCAL request.jwt.claims = '{"sub":"$u","role":"authenticated"}';
CREATE TEMP TABLE ref AS SELECT id FROM tasks WHERE is_task_visible(id, auth.uid());
CREATE TEMP TABLE proto AS
SELECT t.id FROM tasks t
WHERE t.user_id = auth.uid()
   OR t.assigned_to = auth.uid()
   OR (t.group_id IS NOT NULL AND t.group_id IN (
        SELECT tg.id FROM task_groups tg WHERE tg.user_id = auth.uid()
        UNION ALL SELECT gm.group_id FROM group_members gm WHERE gm.user_id = auth.uid()
        UNION ALL SELECT tg.id FROM task_groups tg JOIN task_groups parent ON parent.id = tg.parent_id WHERE parent.user_id = auth.uid()
        UNION ALL SELECT tg.id FROM task_groups tg JOIN group_members gm ON gm.group_id = tg.parent_id
                   WHERE gm.user_id = auth.uid() AND gm.role = ANY (ARRAY['owner','participant'])))
   OR EXISTS (SELECT 1 FROM task_participants tp WHERE tp.task_id = t.id AND tp.user_id = auth.uid())
   OR (t.department_id IS NOT NULL AND t.department_id IN (SELECT ud.department_id FROM user_departments ud WHERE ud.user_id = auth.uid()))
   OR t.id IN (SELECT x.task_id FROM public.user_extra_visible_task_ids(auth.uid()) x(task_id));
SELECT (SELECT count(*) FROM ref) || '|' ||
       (SELECT count(*) FROM (SELECT id FROM ref EXCEPT SELECT id FROM proto) a) || '|' ||
       (SELECT count(*) FROM (SELECT id FROM proto EXCEPT SELECT id FROM ref) b);
ROLLBACK;
SQL
)
  line=$(printf '%s' "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' | tail -1)
  total=$((total+1))
  if [ -z "$line" ]; then echo "ОШИБКА у $u"; bad=$((bad+1)); continue; fi
  miss=${line#*|}; a=${miss%%|*}; b=${miss##*|}
  if [ "$a" != "0" ] || [ "$b" != "0" ]; then
    echo "РАСХОЖДЕНИЕ $u: видно ${line%%|*}, только в эталоне $a, только в прототипе $b"
    bad=$((bad+1))
  fi
done
echo "ИТОГ: проверено $total пользователей, расхождений у $bad"
