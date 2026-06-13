# Фаза 1 — Тестовое развёртывание (staging)

**Цель:** поднять весь self-hosted стек на VPS под поддоменом `stage.justtodoit.ru`
и убедиться, что он стартует. Без простоя боевого окружения.

---

## 1.1 Генерация ключей

```bash
cd /opt/jtd

JWT_SECRET=$(openssl rand -base64 32)
SECRET_KEY_BASE=$(openssl rand -base64 64)
POSTGRES_PASSWORD=$(openssl rand -base64 24)

node self-hosting/generate-keys.js "$JWT_SECRET"
# → выдаст ANON_KEY и SERVICE_ROLE_KEY
```

> ⚠️ Эти ключи будут **боевыми** после cutover. Сохрани их в менеджер паролей.
> JWT_SECRET менять после генерации нельзя — иначе все сессии инвалидируются.

---

## 1.2 Заполнение .env.supabase

```bash
cp self-hosting/.env.supabase.example self-hosting/.env.supabase
```

Заполнить:
- `SITE_URL`, `API_EXTERNAL_URL` → `https://stage.justtodoit.ru` (на этой фазе)
- `POSTGRES_PASSWORD`, `JWT_SECRET`, `SECRET_KEY_BASE`, `ANON_KEY`, `SERVICE_ROLE_KEY`
- SMTP (Яндекс 360)
- **Storage S3** (из п.2): `STORAGE_BACKEND=s3` + `STORAGE_S3_*`
- **Бэкапы** (из п.1): `BACKUP_DIR=/mnt/backup-disk/jtd`
- `TELEGRAM_BOT_TOKEN`, AI-ключ

---

## 1.3 Запуск стека

```bash
docker compose -f self-hosting/docker-compose.supabase.yml \
  --env-file self-hosting/.env.supabase \
  up -d

# Дождаться healthcheck
docker compose -f self-hosting/docker-compose.supabase.yml ps
```

---

## 1.4 Проверка расширений PostgreSQL

```bash
docker compose -f self-hosting/docker-compose.supabase.yml exec db \
  psql -U postgres -c "
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    SELECT extname, extversion FROM pg_extension
    WHERE extname IN ('pg_cron','pg_net','pgcrypto','uuid-ossp');
  "
```

---

## Проверка фазы 1

```bash
./scripts/health-check.sh https://stage.justtodoit.ru <ANON_KEY>
```

Проверяет: все контейнеры healthy, REST API отвечает (`/rest/v1/`),
Auth отвечает (`/auth/v1/health`), Storage отвечает, фронтенд раздаётся nginx.

---

## Откат фазы 1

```bash
docker compose -f self-hosting/docker-compose.supabase.yml down
# Боевой облачный Supabase не затронут — продолжает работать.
```
