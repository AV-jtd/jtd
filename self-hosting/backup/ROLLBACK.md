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
# Посмотреть доступные дампы
./self-hosting/backup/restore.sh --list

# Восстановить из последнего дампа
POSTGRES_PASSWORD=<пароль> \
DB_CONTAINER=self-hosting-db-1 \
./self-hosting/backup/restore.sh --latest

# Восстановить из конкретного файла
./self-hosting/backup/restore.sh /backups/daily/db_20260613_020000.dump
```

## Проверка работы бэкапов

```bash
# Прогнать полный тест
POSTGRES_PASSWORD=<пароль> \
DB_CONTAINER=self-hosting-db-1 \
BACKUP_DIR=/var/backups/jtd \
./self-hosting/backup/test-backup.sh
```
