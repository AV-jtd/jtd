-- Пароли служебных ролей. Выполняется ТОЛЬКО при инициализации пустого тома
-- базы (docker-entrypoint-initdb.d); на работающую базу не влияет.
--
-- Пароли ролей живут на уровне кластера и в дамп не попадают никогда. Без
-- этого файла в новом контейнере GoTrue, PostgREST и storage не подключатся:
-- у их ролей не будет пароля.
--
-- Рядом лежит ПУСТОЙ КАТАЛОГ roles.sql — не удалять и не заменять файлом.
-- Docker создал его сам на месте отсутствовавшего файла, и работающий
-- контейнер базы смонтирован именно на каталог: заменить его файлом — и при
-- следующем перезапуске контейнер не стартует ("not a directory", проверено
-- 27.09.2026). Каталог можно удалить после пересоздания контейнера базы по
-- новому compose, где подключается этот файл.
--
-- Подключается в init-scripts/, а не в корень initdb.d: там он выполнился бы
-- раньше migrate.sh, который создаёт роли, и инициализация упала бы.
--
-- Все службы в docker-compose.supabase.yml ходят в базу с POSTGRES_PASSWORD.
\set pgpass `echo "$POSTGRES_PASSWORD"`

-- Роли, которых на этом шаге ещё нет (supabase_functions_admin создаётся
-- позже, в миграциях образа), пропускаются: ALTER на несуществующую роль
-- остановил бы инициализацию. Нашим службам нужны authenticator,
-- supabase_auth_admin и supabase_storage_admin.
SELECT format('ALTER ROLE %I WITH PASSWORD %L', rolname, :'pgpass')
  FROM pg_roles
 WHERE rolname IN ('authenticator', 'supabase_auth_admin',
                   'supabase_storage_admin', 'pgbouncer',
                   'supabase_functions_admin')
\gexec
