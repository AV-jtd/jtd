# Откат п.1: Бэкапы

## Откат всего п.1 (удалить backup-инфраструктуру)

```bash
# Остановить и удалить backup-контейнер
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  stop pg-backup

docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  rm -f pg-backup

# Удалить том (ТОЛЬКО если бэкапы не нужны)
docker volume rm self-hosting_backup_data
```

Это не затрагивает данные приложения (`db_data`, `storage_data`).

## Восстановление БД из конкретного дампа

```bash
./self-hosting/backup/restore.sh --list            # доступные дампы
./self-hosting/backup/restore.sh --latest          # последний ежедневный
./self-hosting/backup/restore.sh /var/backups/jtd/daily/db_20260927_030001.dump
```

Пароль берётся из `.env.supabase`. Скрипт останавливает службы, откладывает
текущую базу под именем `postgres_before_<время>` (откат — переименовать
обратно), восстанавливает, пересоздаёт секреты vault и проверяет вход
служебных ролей. Файл ролей `roles_*.sql` должен лежать рядом с дампом.

Копии, снятые до 27.09.2026, не содержат прав и ролей: скрипт сам применит
`db-init/grants-fallback.sql`. Почему так — `JOURNAL.md`, запись от 27.09.

## Проверка копий — учебное восстановление

```bash
bash self-hosting/backup/restore-drill.sh            # последняя копия
bash self-hosting/backup/restore-drill.sh <дамп>     # конкретная
```

Минута, прод не трогается. Проверяет не «данные на месте», а вход по паролю
и чтение через PostgREST. Прежний `test-backup.sh` этого не проверял.
