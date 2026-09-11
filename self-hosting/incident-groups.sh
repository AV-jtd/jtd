#!/usr/bin/env bash
# Разбор инцидента «пропали все проекты» + молчащие еженедельные рассылки.
# Только чтение. Ничего не меняет и не восстанавливает.
#
# Запуск:  bash /opt/jtd/self-hosting/incident-groups.sh [фамилия]
#          bash /opt/jtd/self-hosting/incident-groups.sh Плотникова
#
# Обе поломки объясняются одним: рассылки пропускают пользователя, если у
# него нет ни одного ОТКРЫТОГО КОРНЕВОГО проекта (closed_at IS NULL и
# parent_id IS NULL). Если проекты закрылись или исчезли — интерфейс пуст
# и отчёты молчат. Скрипт проверяет, так ли это, и когда это случилось.

set -uo pipefail
WHO="${1:-Плотникова}"
q() { docker exec self-hosting-db-1 psql -U postgres -X -P pager=off "$@" 2>&1; }
h() { printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\033[1mРазбор инцидента — %s\033[0m\n' "$(date '+%d.%m.%Y %H:%M:%S %Z')"
q -tAc "SELECT 'Время в базе: '||now()"

h "1. Проекты целиком: есть ли они вообще"
q -c "SELECT count(*) AS всего,
             count(*) FILTER (WHERE closed_at IS NULL) AS открытых,
             count(*) FILTER (WHERE closed_at IS NOT NULL) AS закрытых,
             count(*) FILTER (WHERE parent_id IS NULL AND closed_at IS NULL) AS открытых_корневых,
             max(created_at)::timestamp(0) AS последний_создан
      FROM task_groups;"

h "2. Массовое закрытие: когда именно закрывались проекты"
# Если в одном часе разом закрылись десятки — это не ручная работа.
q -c "SELECT date_trunc('hour', closed_at)::timestamp(0) AS час, count(*) AS закрыто
      FROM task_groups WHERE closed_at IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 8;"

h "3. Пользователь: $WHO"
q -c "SELECT id, display_name, is_approved, telegram_chat_id IS NOT NULL AS телеграм_привязан
      FROM profiles WHERE display_name ILIKE '%${WHO}%';"

h "4. Его проекты: свои и те, где участник"
q -c "WITH u AS (SELECT id FROM profiles WHERE display_name ILIKE '%${WHO}%' LIMIT 1)
      SELECT 'свои' AS источник, count(*) AS всего,
             count(*) FILTER (WHERE closed_at IS NULL AND parent_id IS NULL) AS открытых_корневых
        FROM task_groups g, u WHERE g.user_id = u.id
      UNION ALL
      SELECT 'участник', count(*),
             count(*) FILTER (WHERE g.closed_at IS NULL AND g.parent_id IS NULL)
        FROM group_members m JOIN task_groups g ON g.id = m.group_id, u WHERE m.user_id = u.id;"

h "5. Последние запуски крон-заданий за сутки"
# Молчащая рассылка могла и не запускаться вовсе — это разные причины.
q -c "SELECT j.jobname, d.status, d.start_time::timestamp(0) AS запуск,
             left(coalesce(d.return_message,''), 50) AS сообщение
      FROM cron.job_run_details d JOIN cron.job j USING (jobid)
      WHERE d.start_time > now() - interval '24 hours'
      ORDER BY d.start_time DESC LIMIT 10;"

h "6. Журнал отправленных отчётов за неделю"
# Если строки есть — функция отработала и решила, что слать нечего.
# Если строк нет — она либо не запускалась, либо упала до отправки.
q -c "SELECT report_type, week_start, count(*) AS отправок, max(created_at)::timestamp(0) AS последняя
      FROM weekly_send_log WHERE created_at > now() - interval '8 days'
      GROUP BY 1,2 ORDER BY 3 DESC;"

h "7. Удаления: не пропали ли строки физически"
# Свежий дамп есть, но важно понимать масштаб до восстановления.
q -c "SELECT (SELECT count(*) FROM tasks) AS задач,
             (SELECT count(*) FROM task_groups) AS проектов,
             (SELECT count(*) FROM group_members) AS участий,
             (SELECT count(*) FROM profiles) AS профилей;"

h "8. Доступные дампы для восстановления"
docker exec self-hosting-pg-backup-1 sh -c 'ls -lh /mnt/backup-disk/jtd/daily/*.dump 2>/dev/null | tail -5' 2>/dev/null \
  || echo "  каталог дампов не прочитался — проверьте вручную"

printf '\n\033[1mЧто смотреть\033[0m\n'
echo "  Раздел 1: если «открытых_корневых» ноль или почти ноль — причина найдена."
echo "  Раздел 2: закрытие десятков проектов в один час = не ручная работа."
echo "  Раздел 7: если проектов мало или ноль — строки удалены, нужен откат из дампа."
echo "  Разделы 5-6: молчала рассылка сама или ей нечего было слать."
