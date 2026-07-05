# Прогресс переезда JTD на VPS (актуальный)

> Живой чек-лист. Единая точка правды — PLAN.md.
> Этот файл — статус и реквизиты.

Ветка работы: `claude/modest-hawking-sfszra`

---

## Реквизиты

Провайдер: **Sweb** (VPS + S3 в одной сети → внутрисетевой трафик бесплатный)

| Параметр | Значение | Статус |
|---|---|---|
| IP VPS | `189.74.120.232` | ✅ |
| SSH-доступ | `root@189.74.120.232` | ✅ работает |
| Доступ из РФ без VPN | Kong ответил с моб. интернета | ✅ проверено |
| S3 endpoint | `https://s3.regru.cloud` | ✅ |
| S3 bucket (файлы) | `jtd-storage` | ✅ |
| S3 bucket (бэкапы) | `jtd-backups` | ✅ |
| Бэкап Lovable | `s3://jtd-backups/supabase-backup.zip` | ✅ |

> ⚠️ Секреты — только в `/opt/jtd/self-hosting/.env.supabase`. Не коммитить.

---

## Текущий статус компонентов

| Компонент | Статус | Детали |
|---|---|---|
| VPS сеть | ✅ | 189.74.120.232 |
| SSH-доступ | ✅ | |
| Supabase стек (11 контейнеров) | ✅ Up | все healthy |
| Схема БД (59 таблиц) | ✅ | применена |
| auth.users (55 пользователей) | ✅ | загружены с исходными UUID |
| Данные (все 59 таблиц) | ✅ | 87 615 строк, FK-целостность OK |
| Фронтенд собран | ✅ | `dist/` 7.0M, proxy URL `https://justtodoit.ru/sb` |
| nginx + домен | ✅ | контейнер отдаёт dist/, проксирует /sb/ → Kong, UFW 80/443 открыт |
| SSL | ⬜ | сертификат есть только для `77-222-53-183.swtest.ru`; для justtodoit.ru — после DNS |
| DNS переключён | 🟡 | justtodoit.ru (корень) → 189.74.120.232 через SpaceWeb API; www.justtodoit.ru остался на 185.158.133.1 (canChange:false, нужна заявка в поддержку SpaceWeb); распространение кеша в процессе |

---

## Шаги (по PLAN.md)

- [x] **Шаг 0** — VPS, S3, Supabase стек поднят
- [x] **Шаг 1** — Схема БД (59 таблиц) применена
- [x] **Шаг 2** — Данные мигрированы:
  - [x] auth.users: 55 пользователей с исходными UUID (временный пароль, будет сброс)
  - [x] 59 таблиц public schema: 87 615 строк
  - [x] FK-целостность проверена (0 broken refs)
  - [x] Скрипты: `migration-stream/create_auth_users.py`, `load_tables_psycopg2.py`
- [x] **Шаг 3** — Собрать фронтенд
  - Собрано с `VITE_SUPABASE_URL=https://justtodoit.ru` и `VITE_SUPABASE_PROXY_URL=https://justtodoit.ru/sb`
    (клиент в `src/integrations/supabase/client.ts` использует явный proxy URL, а nginx проксирует именно `/sb/`)
  - `ANON_KEY` взят из `.env.supabase`
- [x] **Шаг 4** — nginx + домен
  - docker-compose уже монтирует `nginx-full.conf` и `../dist` в контейнер `nginx`
  - Проверено локально: `/` → 200, `/sb/rest/v1/` → 200, WS handshake до Kong проходит (403 — ожидаемый auth-ответ Kong на anon key, не проблема проксирования)
  - Проверено внешне: `curl -H "Host: justtodoit.ru" http://189.74.120.232/` → 200
  - UFW: 80/tcp и 443/tcp открыты
- [x] **Шаг 5** — Переключить DNS (подтверждено пользователем)
  - Через официальный API SpaceWeb (`api.sweb.ru/domains/dns`, метод `editMain`): justtodoit.ru (root, index 0) → 189.74.120.232
  - ⚠️ `www.justtodoit.ru` не переключён — запись `canChange:false`, нужна заявка в поддержку SpaceWeb на её редактирование
  - TTL снизить не удалось (пользователь предупредил заранее) — пропагация идёт с исходным TTL (~381с на момент переключения)
- [ ] **Шаг 6** — SSL (`certbot --nginx -d justtodoit.ru`)
- [ ] **Шаг 7** — Сброс паролей 55 пользователей + smoke-test

---

## Журнал сессий

| Дата | Что сделано |
|---|---|
| 2026-06-13 | Создан стрим переезда, подготовка |
| 2026-07-05 | Схема и данные на VPS; Supabase стек up |
| 2026-07-05 | **Шаг 2 завершён**: auth.users (55), все таблицы загружены (87 615 строк), FK OK |
| 2026-07-05 | **Шаг 3 завершён**: фронтенд собран (`dist/`, proxy URL `/sb`) |
| 2026-07-05 | **Шаг 4 завершён**: nginx отдаёт фронтенд и проксирует Kong, проверено локально и внешне |
| 2026-07-05 | **Шаг 5**: DNS justtodoit.ru → VPS через SpaceWeb API (root only, www требует поддержки), ждём пропагации TTL |
