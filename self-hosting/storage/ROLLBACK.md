# Откат п.2: S3-бэкенд Storage

## Откат: вернуться на file-бэкенд

```bash
# 1. В .env.supabase закомментируй или удали:
#    STORAGE_BACKEND=s3

# 2. Перезапусти storage-контейнер
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  restart storage

# 3. Убедись что контейнер поднялся с file-бэкендом
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  logs storage | tail -20
```

Локальные файлы в томе `storage_data` сохранились — они не удалялись при миграции.

## Если нужно вернуть файлы из S3 обратно в локальный том

```bash
# Скачать все файлы из S3 в локальный каталог
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

aws s3 sync s3://${STORAGE_S3_BUCKET}/storage/ /var/lib/jtd-storage/ \
  --endpoint-url ${STORAGE_S3_ENDPOINT} \
  --region ${STORAGE_S3_REGION:-ru-1}
```

## Проверить текущий бэкенд

```bash
docker exec self-hosting-storage-1 env | grep STORAGE_BACKEND
# Должно быть: STORAGE_BACKEND=file
```
