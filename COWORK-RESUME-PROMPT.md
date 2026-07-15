> ⚠️ **УСТАРЕЛО (архив).** Описанный ниже гибридный план (Вариант С:
> личный Supabase + nginx-прокси к Lovable) был заброшен в пользу
> полного self-hosted стека на VPS. Переезд завершён 2026-07-06.
> Актуальный источник правды: `self-hosting/migration-stream/PLAN.md`
> и `self-hosting/migration-stream/HANDOFF-PROMPT.md`. Этот файл оставлен
> только как исторический след, не следуй его шагам.

# Co-work промпт: миграция JTD на VPS (актуальное состояние)

## Цель

Перенести JTD (task-менеджер React + Supabase) с облака Lovable на российский VPS Sweb.
Выбранный подход — **гибридный (Вариант С)**:
- VPS nginx проксирует запросы к Lovable Supabase (боевой трафик не рвётся)
- Параллельно данные мигрируют в личный Supabase и на VPS
- DNS переключается на VPS → пользователи не замечают переезда

## Инфраструктура

| Что | Где |
|-----|-----|
| VPS | `root@77.222.53.183` (Sweb, 4CPU/8GB/Ubuntu 22.04) |
| Репозиторий на VPS | `/opt/jtd`, ветка `claude/modest-hawking-sfszra` |
| S3 endpoint | `https://s3.regru.cloud` |
| S3 бакеты | `jtd-storage` (файлы), `jtd-backups` (бэкапы) |
| Личный Supabase | `https://qavpvelhrgfccfymevdi.supabase.co` |
| Конфиг VPS-стека | `/opt/jtd/self-hosting/.env.supabase` (заполнен, не трогать) |

> Секреты (ключи, пароли) — НЕ коммитить. Хранятся в .env.supabase на VPS.

## Что уже сделано ✅

- VPS настроен: docker, ufw, nginx остановлен, WireGuard установлен
- Supabase self-hosted стек поднят (все 11 контейнеров работают)
- health-check = 10/12 OK (фронтенд 404 — норм, SSL ещё нет)
- Бэкап из Lovable получен: schema.sql + CSV 65 таблиц → `/tmp/supabase-backup/`
- schema.sql применён к личному Supabase (с некритичными ошибками ~492 шт.)

## Текущий статус: нужно проверить

```bash
# Сколько таблиц создалось в личном Supabase:
psql "postgresql://postgres:ArtyVedy(3353)@db.qavpvelhrgfccfymevdi.supabase.co:5432/postgres" \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
```

Ожидаем ~60+ таблиц. Если меньше 40 — schema применилась плохо и нужен разбор ошибок.

## Что делать дальше (по порядку)

### Шаг 1 — Проверить схему личного Supabase
```bash
psql "postgresql://postgres:ArtyVedy(3353)@db.qavpvelhrgfccfymevdi.supabase.co:5432/postgres" \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

### Шаг 2 — Импортировать CSV-данные (65 таблиц)
Скрипт для импорта в правильном порядке (родительские таблицы первыми):
```bash
cd /tmp/supabase-backup

DB="postgresql://postgres:ArtyVedy(3353)@db.qavpvelhrgfccfymevdi.supabase.co:5432/postgres"

# Отключить триггеры на время импорта
psql "$DB" -c "SET session_replication_role = replica;"

for csv in csv/*.csv; do
  table=$(basename "$csv" .csv)
  echo "Importing $table..."
  psql "$DB" -c "\copy public.$table FROM '$csv' WITH CSV HEADER" 2>&1
done

# Включить триггеры обратно
psql "$DB" -c "SET session_replication_role = DEFAULT;"
```

### Шаг 3 — Настроить nginx на VPS как прокси к Lovable
Пока DNS не переключён — nginx на VPS проксирует к текущему Lovable Supabase.
Нужно получить у пользователя URL облачного Supabase (вида `https://xxx.supabase.co`).

Конфиг nginx (`/opt/jtd/self-hosting/nginx-full.conf`) должен:
- Отдавать фронтенд из `/opt/jtd/dist`
- Проксировать `/sb/` → Lovable Supabase

### Шаг 4 — Собрать фронтенд для staging
```bash
cd /opt/jtd
VITE_SUPABASE_URL=http://77.222.53.183/sb \
VITE_SUPABASE_ANON_KEY=<ANON_KEY из .env.supabase> \
npm run build
```

### Шаг 5 — Выпустить SSL и переключить DNS
- Снизить TTL домена до 60с (уже запрошено в поддержке Sweb)
- DNS `stage.justtodoit.ru` → `77.222.53.183`
- Certbot: `certbot --nginx -d stage.justtodoit.ru`
- Smoke-test staging
- DNS боевого `justtodoit.ru` → `77.222.53.183` (точка невозврата)

### Шаг 6 — Переключить Supabase на VPS
После стабильной работы прокси — переключить фронтенд на локальный Supabase стек
(Kong на `http://localhost:8000`), пересобрать, перезапустить.

## Файлы бэкапа на VPS
```
/tmp/supabase-backup/
  schema.sql       — структура БД (217 миграций)
  csv/             — данные 65 таблиц
  manifest.csv     — список таблиц и кол-во строк
  errors.log       — ошибки при импорте
```

## Правила работы

- Команды давать блоками для копипаста в терминал
- После каждого вывода — интерпретировать результат
- НЕ переходить к следующему шагу если текущий не OK
- Перед переключением DNS (шаг 5) — **обязательный стоп**, согласовать с пользователем
- SSL выпускать ПОСЛЕ того как DNS укажет на VPS
- Секреты НЕ коммитить в git

## Дополнительный контекст

- Portainer: `http://77.222.53.183:9000` (логин: admin / ArtemVsegdaPrav11)
- Kong (Supabase API gateway): порт 8000
- Полный план: `self-hosting/migration-stream/README.md`
- Прогресс чеклист: `self-hosting/migration-stream/PROGRESS.md`
- Скрипты: `self-hosting/migration-stream/scripts/`
