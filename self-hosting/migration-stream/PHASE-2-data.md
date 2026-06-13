# Фаза 2 — Миграция данных (репетиция)

**Цель:** перенести данные из облачного Supabase на VPS и сверить целостность.
Это **репетиция** — выполняется на staging без простоя прода.

---

## 2.1 Выгрузка из облака

```bash
# Connection string: Supabase Dashboard → Settings → Database
export CLOUD_DB="postgresql://postgres:[PASSWORD]@db.nvfioycpwyzwukvokwql.supabase.co:5432/postgres"

# Полный дамп со схемами auth, storage, public
pg_dump "$CLOUD_DB" \
  --no-owner --no-privileges \
  -Fc -f /mnt/backup-disk/jtd/cloud_full_$(date +%Y%m%d).dump

# Зафиксировать row counts источника для последующей сверки
./scripts/snapshot-counts.sh "$CLOUD_DB" > /mnt/backup-disk/jtd/cloud_counts.txt
```

> Дамп всех схем (`auth`, `storage`, `public`) важен — иначе потеряются
> пользователи (`auth.users`) и метаданные файлов (`storage.objects`).

---

## 2.2 Заливка на VPS

```bash
NEW_DB_CONTAINER=self-hosting-db-1

# Восстановление
docker exec -i $NEW_DB_CONTAINER \
  pg_restore -U postgres -d postgres --no-owner --no-privileges --exit-on-error \
  < /mnt/backup-disk/jtd/cloud_full_$(date +%Y%m%d).dump
```

> Если pg_restore ругается на уже существующие объекты схемы (созданные
> образом supabase/postgres) — это ожидаемо. Используй `--clean --if-exists`
> только для `public`, схемы `auth`/`storage` восстанавливай данными поверх.
> Детали и обработка ошибок — в `scripts/restore-cloud-dump.sh`.

---

## 2.3 Миграция файлов Storage (п.2)

```bash
# Если файлы были в облачном Storage — выгрузить их и залить в РФ S3.
# Вариант А: через Supabase CLI / S3-протокол облака → РФ S3 (rclone)
# Вариант Б: если уже на file-бэкенде — self-hosting/storage/migrate-to-s3.sh

rclone sync cloud-supabase:storage rf-s3:jtd-storage/storage
```

---

## 2.4 Сверка целостности

```bash
./scripts/verify-migration.sh "$CLOUD_DB" $NEW_DB_CONTAINER
```

Скрипт сравнивает количество строк во ВСЕХ ключевых таблицах между облаком
и VPS. Любое расхождение → STATUS: ПРОВАЛ.

Ключевые таблицы для сверки:
`auth.users`, `profiles`, `tasks`, `task_groups`, `task_comments`,
`group_messages`, `clients`, `storage.objects`, `user_roles`.

---

## Проверка фазы 2

- [ ] verify-migration.sh = OK (все counts совпадают)
- [ ] `auth.users` перенесены (пользователи смогут залогиниться)
- [ ] `storage.objects` метаданные на месте, файлы в S3

---

## Откат фазы 2

```bash
# Просто пересоздать БД на VPS и повторить — прод не затронут
docker compose -f self-hosting/docker-compose.supabase.yml exec db \
  psql -U postgres -c "DROP DATABASE postgres;" # затем restore заново
```
