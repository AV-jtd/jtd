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
| SSL | ✅ | Let's Encrypt для justtodoit.ru выпущен (до 2026-10-03), auto-renew настроен |
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
- [x] **Шаг 6** — SSL
  - `certbot certonly --webroot -w /opt/jtd/dist -d justtodoit.ru` (сработало сразу — Let's Encrypt резолвит домен напрямую, не через кешированные резолверы, поэтому не пришлось ждать пропагации TTL)
  - nginx-full.conf: добавлен блок 443 ssl + редирект 80→443, location для acme-challenge
  - ⚠️ Важно: bind-mount `nginx-full.conf` — при редактировании файла с хоста нужен `docker restart self-hosting-nginx-1` (не просто `nginx -s reload`), иначе контейнер держит старый inode
  - Проверено: редирект 80→301→443, /sb/ проксирование по HTTPS — 200
- [x] **Шаг 7** — Сброс паролей 59 пользователей + smoke-test (пользователь подтвердил завершение 2026-07-07)
  - 🐛 Найдены и исправлены баги миграции, из-за которых **никто не мог залогиниться**:
    1. `instance_id` был NULL у 54/55 пользователей вместо zero-UUID
    2. Токен-поля (confirmation_token, recovery_token, email_change*, ...) были NULL вместо '' — GoTrue падал с 500 (Go sql.Scan не принимает NULL в string)
    3. `auth.identities` была полностью пустая — досозданы identity-записи provider='email' для всех 55
    4. **Главная причина**: `GOTRUE_JWT_AUD` не был задан в docker-compose.supabase.yml → GoTrue искал пользователей с aud="", а у них aud='authenticated'. Добавлено `GOTRUE_JWT_AUD: authenticated`, auth-контейнер пересоздан.
  - `fix_auth_users.sql` — идемпотентный скрипт на случай регрессии после будущих перезаливок (см. отдельный инцидент ниже)
  - SMTP для reset-password писем не работал (`SMTP_PASS=ЗАМЕНИТЬ_ПОЗЖЕ`) — обходной план B: временные пароли сгенерированы для всех 59, разосланы через рабочую telegram-функцию (23/58 автоматически), остальным передано вручную
  - Smoke-test пройден: вход подтверждён, задачи создаются через веб, Telegram и MAX (включая AI-разбор через OpenRouter), данные на месте

## Инцидент: массовые 502 на /rest/v1/ (2026-07-05, устранён)

- Симптом: 502 на task_comments/task_participants/subtasks/task_tags при запросах вида `task_id=in.(...много UUID...)`
- Причина: внешний nginx (self-hosting-nginx-1), настроенный при выпуске SSL, не имел тюнинга буферов — дефолтные 4-8k не вмещали большие заголовки ответа PostgREST/Kong для запросов с сотнями UUID. Ошибка в логе: `upstream sent too big header while reading response header from upstream`. Kong сам уже был настроен на 160k (KONG_NGINX_PROXY_BUFFER_SIZE), но это не было продублировано во внешнем nginx.
- Фикс: в `nginx-full.conf` location `/sb/` добавлены `proxy_buffer_size 160k`, `proxy_buffers 64 160k`, `proxy_busy_buffers_size 160k`; на уровне server — `large_client_header_buffers 4 160k`. nginx перезапущен (restart, не reload — см. заметку про bind-mount выше).
- Проверено: воспроизведён тот же запрос с 150 UUID — 200 OK, 502 в логах после фикса не наблюдается.
- Побочно замечено (не устранялось): `/sb/realtime/v1/websocket` отдаёт 403 — отдельная проблема авторизации realtime.

## Инцидент: расхождение схемы с живой Lovable БД (2026-07-06, устранён)

При аудите по `schema_live_full.sql` (получен от Lovable, 66 таблиц, 5589 строк
DDL из pg_catalog живой БД) обнаружено и устранено:

- **15 недостающих функций**: `can_see_task`, `can_view_profile`, `can_view_tag`,
  `consultant_can_see_group/tag/task/user`, `consultant_company`,
  `email_queue_dispatch/wake`, `is_protocol_draft`,
  `is_protocol_internal_attendee`, `is_task_in_protocol_attendee_scope`,
  `user_protocol_groups_arr`, `user_visible_group_ids` — докатили в порядке
  зависимостей (топологическая сортировка, т.к. SQL-функции валидируют
  вызываемые функции при CREATE)
- **49 недостающих RLS-политик** на 27 таблицах (в основном "Consultant block
  on X" и "Internal attendees can ... protocol ...") — докатили дословно
- **2 неверные политики** на `task_step_templates` (мои реконструкции по
  аналогии) — заменены на точные из живой схемы
- **3 недостающих индекса**: `idx_task_groups_project_type`,
  `uniq_npd_stream_subproject_per_parent`, `idx_tasks_client_id`
- **`task_groups.project_type`**: не было `DEFAULT 'standard' NOT NULL` —
  добавлено с бэкфиллом 1334 строк
- **`wiki_pages.group_id`**: у нас был лишний `NOT NULL`, в живой схеме
  nullable — снято
- **`task_dependencies`**: добавлены `predecessor_entity_type`/
  `successor_entity_type`, восстановлены все 307 значений из CSV-бэкапа

Итог полной сверки после патча: 0 расхождений по колонкам (66/66 таблиц),
политикам (295/295), функциям (118/118), индексам (106/106).
Скрипты: `migration-stream/full_patch.sql`, `missing_functions.sql`,
`missing_policies.sql`.

⚠️ Данные всё ещё из бэкапа от 15 июня — свежий экспорт нужен отдельным шагом.

## Финальная перезаливка данных (2026-07-06, свежий экспорт от 5 июля)

- Источник: `s3://jtd-backups/jtd-backup-20260705.zip` (67 CSV, все колонки)
- TRUNCATE всех 66 public-таблиц одним запросом (без auth.users — другая схема)
- Загрузка через `\copy table (явный_список_колонок) FROM file WITH CSV HEADER`
  — **важно**: без явного списка колонок `\copy` сопоставляет позиционно, а не
  по именам заголовка; для таблиц, где мы добавляли колонки через ALTER TABLE
  в конец (profiles, task_groups, tasks), порядок в CSV и в нашей таблице
  разошёлся — без явных колонок это привело бы к молчаливой порче данных
- Итог: 0 расхождений row count по всем 66 таблицам vs `_manifest.csv`
- auth.users: 55 → 59 (докатил 4 недостающих пользователя по UUID из новых
  профилей, тем же паттерном instance_id/identities, что и раньше)
- FK-аудит (84 связи): нашёл и удалил 2 устаревших constraint
  (`task_dependencies_predecessor/successor_id_fkey` на tasks) — в живой
  схеме их нет, остались от старой версии до полиморфных entity_type
  (task/milestone/project). 1 известная орфанная запись (tag без
  user_id в auth.users/profiles) — не удалялась, решение за пользователем.

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
| 2026-07-05 | **Шаг 6 завершён**: SSL для justtodoit.ru выпущен, nginx настроен на 443 + редирект с 80 |
| 2026-07-05 | Найден и исправлен критичный баг: GOTRUE_JWT_AUD не был задан, никто не мог войти. Исправлены instance_id/token-поля/identities для всех 55, добавлен GOTRUE_JWT_AUD=authenticated. Вход avedyaev@gmail.com проверен и работает |
| 2026-07-06 | Telegram/интеграции указывали на облако Lovable — исправлено (см. раздел ниже) |

## Инцидент: Telegram и cron-задачи били в облако Lovable (2026-07-06, устранён)

- **Telegram webhook**: указывал на `nvfioycpwyzwukvokwql.supabase.co`, переключён на
  `https://justtodoit.ru/functions/v1/telegram-webhook?apikey=<ANON_KEY>` (apikey в query
  обязателен — у роута `/functions/v1/` в Kong включён key-auth, Telegram не шлёт
  никаких auth-заголовков сам).
- **Найден более серьёзный, отдельный баг**: `supabase/functions/main/index.ts`
  (диспетчер edge-runtime в режиме `--main-service`) был заглушкой, возвращавшей
  `"JTD Edge Runtime OK"` для ЛЮБОГО пути — то есть **все** edge-функции на VPS
  были нерабочими, не только telegram-webhook. Переписан на настоящий роутер через
  `EdgeRuntime.userWorkers.create` (стандартный паттерн self-hosted Supabase),
  edge-runtime пересоздан. Проверено на нескольких функциях (не только telegram).
- **2 живых pg_cron задачи** (`protocol-buffer-flush` — раз в минуту,
  `send-weekly-group-report-friday` — раз в неделю) вызывали облако. Переключены
  на внутренний `http://kong:8000/functions/v1/...` (эффективнее публичного URL —
  без DNS/интернета/SSL) через `cron.alter_job()`. Проверено: `net._http_response`
  показывает 200 OK каждую минуту. `self-hosting/migrate-cron.sql` обновлён под
  реально применённый и проверенный вариант.
- **Хардкод cloud-URL внутри кода** `telegram-webhook`/`max-webhook` (в action
  `setup_webhook`, которая могла бы молча вернуть webhook обратно на облако) —
  заменён на динамический `SITE_URL` из окружения edge-runtime (добавлена
  переменная в docker-compose).
- **MAX-мессенджер**: `MAX_BOT_TOKEN` не настроен в `.env.supabase` вообще —
  интеграция сейчас неактивна на VPS. Не проверялось/не переключалось —
  требуется решение пользователя (перенести токен или отключить в облаке).
- **Дельта задач, попавших в облако до переключения**: точное число не
  получено (нет service_role/пароля от облачной БД, только anon-ключ, RLS
  блокирует anon-чтение tasks). Cutoff нашего экспорта: `2026-07-05 16:24:12 UTC`.
  Для точного числа нужно выполнить в Lovable SQL-редакторе:
  `SELECT count(*) FROM public.tasks WHERE created_at > '2026-07-05 16:24:12+00';`
  (верхняя граница — включает вообще все новые задачи, не только из Telegram,
  маркера источника в схеме нет).
- Проверено end-to-end: тестовое сообщение в Telegram → задача появилась в
  БД VPS (`f520afec-...`, `/yado Claude проверка`, `2026-07-06 04:34:38 UTC`).
- Побочно замечено (не чинилось, вне периметра миграции): ошибка в
  AI-обогащении задач (`aiEnrichTask` в telegram-webhook, вызов
  `ai.gateway.lovable.dev`) — "headers of RequestInit is not a valid
  ByteString". Не блокирует создание задачи (обёрнуто в try/catch), номер
  строки в трейсе не совпадает с текущим файлом — похоже на кэш модуля.

## Инцидент: "не могу войти после перезаливки данных" (2026-07-06, ложная тревога)

Пользователь сообщил о проблеме входа после перезаливки данных, гипотеза —
что TRUNCATE/перезаливка публичных таблиц откатила auth-фиксы. Диагностика
это НЕ подтвердила:

- `auth.users`/`auth.identities`: ровно 59/59/59, все структурные фиксы целы
  (instance_id, token-поля, aud/role, identities) — TRUNCATE был scoped
  только на `public` схему, `auth` не затрагивался вообще
- Реальная причина: во время диагностики 414-ошибки ранее в этой же сессии
  пароль avedyaev@gmail.com был молча сброшен для получения тестового
  токена, новое значение не было сообщено пользователю (`updated_at`
  строки — `2026-07-05 22:04:24 UTC`, точно совпадает по времени)
- Пароль переустановлен и сообщён пользователю, вход подтверждён
  (`POST /token?grant_type=password` → 200 + access_token)

Тем не менее — по просьбе пользователя — оформлен идемпотентный скрипт
`migration-stream/fix_auth_users.sql`, закрывающий разом все 4 известные
причины поломки входа (instance_id/token-поля/aud-role/identities) для
ВСЕХ пользователей разом. Безопасно гонять повторно в любой момент как
профилактику — при первом прогоне после этого инцидента все счётчики
"still_*" вышли нулевыми (регрессии не было).

## Инцидент: MAX-бот не может создать задачу через AI-разбор (2026-07-06, отложено)

Webhook и роутинг MAX работают полностью (подтверждено: `[Info] MAX update:
...` в логах edge-runtime, сообщение дошло, team scan прошёл). Падает
конкретно `aiBulkParse`/`aiEnrichTask` (общий код для Telegram и MAX) —
`TypeError: Failed to construct 'Request': 'headers' ... is not a valid
ByteString`. Причина: `LOVABLE_API_KEY=ЗАМЕНИТЬ_ПОЗЖЕ` в `.env.supabase` —
кириллица в значении делает заголовок `Authorization: Bearer ...`
невалидным ещё до сетевого запроса.

**Уточнение к бэклогу другой сессии** (PLAN.md, коммит d0146d32 "wire AI to
OpenRouter — Lovable AI Gateway unavailable on VPS"): это предположение
проверено и НЕ подтвердилось — `curl https://ai.gateway.lovable.dev/...` с
хоста VPS отдаёт `401` (сеть/DNS в порядке, просто нет валидного ключа),
а не таймаут/connection refused. То есть переключение на OpenRouter —
НЕ обязательно; проблема решается просто подстановкой реального
`LOVABLE_API_KEY`, если он есть.

Отложено пользователем — не блокирует основной функционал (создание задач
через веб-интерфейс работает; проблема только в AI-разборе свободного
текста через ботов).

## Обновление: AI переведён на OpenRouter, добавлена смена пароля (2026-07-07)

Смёржены доработки Lovable из main (10 коммитов):
- `ChangePasswordSection.tsx` — самостоятельная смена пароля в настройках,
  использует стандартные `signInWithPassword`+`updateUser` через GoTrue,
  бэкенд трогать не пришлось
- Все AI-функции (ai-assistant, telegram-webhook, max-webhook,
  messenger-core.ts и др.) переведены с `ai.gateway.lovable.dev` на
  `openrouter.ai` — закрывает инцидент с невалидным ByteString в
  LOVABLE_API_KEY
- `OPENROUTER_API_KEY` добавлен в docker-compose (проводка) и
  `.env.supabase` (реальное значение, не в git), edge-runtime пересоздан
- Проверено: прямой запрос к openrouter.ai с ключом → 200 OK

Фронтенд пересобран и задеплоен. Мердж чистый, без конфликтов с
self-hosting/*.

## Аудит бэкапов (2026-07-07)

**До аудита**: контейнер `pg-backup` работал исправно (ежедневно в 02:00,
ротация 7д/4н/6м), но бэкапы лежали **только локально** — в docker-volume
`self-hosting_backup_data` на том же диске VPS, что и сама БД. Единая
точка отказа: при потере диска VPS терялись бы и БД, и все бэкапы разом.

**Найден и исправлен независимый баг**: `pg_dump`, встроенный в образ
`supabase/postgres:15.8.1.060` (внутри контейнера `db`), стабильно падает
с segfault (воспроизведено 3/3 попыток, подтверждено в `dmesg`). Именно
поэтому `self-hosting/backup/backup.sh` (host-level скрипт с флагом
`--s3`) не работал — он вызывал `pg_dump` из контейнера `db`. Скрипт
переключён на вызов `pg_dump`/`pg_restore` из контейнера `pg-backup`
(тот же `postgres:15-alpine`, версия 15.18, подключается по сети `-h db`)
— именно так уже несколько недель работает встроенный крон-бэкап
контейнера, поэтому решение проверенное. Заодно поправлен `docker exec`
без `-i` (не пробрасывал stdin) в шаге верификации.

**Настроена ежедневная выгрузка в S3**:
- `self-hosting/backup/run-daily-s3-backup.sh` — обёртка для cron, берёт
  `POSTGRES_PASSWORD` из `.env.supabase`, зовёт `backup.sh --verify --s3`
- host crontab: `0 3 * * *` (через час после локального 02:00 бэкапа
  контейнера — не пересекаются по нагрузке)
- Хранилище: `/var/backups/jtd` на хосте (ротация 7д/4н/6м, как у
  локального)
- S3: `s3://jtd-backups/backups/<hostname>/db_<timestamp>.dump`

**Тестовый прогон подтверждён**:
- Дамп создан и верифицирован (`pg_restore --list` прошёл без ошибок)
- Загружен в S3, скачан обратно, MD5 совпал побайтово с локальным файлом
- Итог: последний успешный бэкап на момент проверки —
  `db_20260707_225913.dump`, 6.2 MB (~6 476 449 байт), локально в
  `/var/backups/jtd/daily/`, в S3 —
  `s3://jtd-backups/backups/77-222-53-183.swtest.ru/db_20260707_225913.dump`

## Инцидент: realtime 403 на /sb/realtime/v1/websocket (2026-07-07, устранён)

Диагностика по слоям (без гадания, каждый шаг проверен отдельно):

1. **Логи realtime**: `TenantNotFound: Tenant not found: realtime` на
   каждой попытке подключения
2. **`_realtime.tenants`**: таблица полностью ПУСТАЯ (0 строк) — тенант
   никогда не создавался ни при первом деплое, ни позже
3. **jwt_secret**: сверять было не с чем, тенанта не было вообще
4. **nginx**: `/sb/` location уже содержит корректные WS-заголовки
   (`Upgrade`, `Connection "upgrade"`, `proxy_http_version 1.1`) — не
   источник проблемы
5. **Kong**: маршрут `realtime-v1` (`/realtime/v1/` → `realtime:4000/socket/`)
   настроен верно, key-auth + ACL на месте — не источник проблемы
6. **Фронтенд**: стандартный `supabase-js`, `external_id` тенанта
   определяется НЕ клиентом, а сервером — self-hosted Realtime берёт его
   из своей же переменной `APP_NAME` (= `realtime` в docker-compose)

**Главная причина**: тенант в `_realtime.tenants` никогда не был создан.
Создаётся не прямым INSERT (чувствительные поля типа `jwt_secret`/
`db_password` шифруются сервисом через Cloak/AES-128-ECB по ключу
`DB_ENC_KEY`), а через Admin API самого realtime (`PUT /api/tenants/<id>`,
авторизация — `SERVICE_ROLE_KEY` как Bearer-токен, не голый секрет).

**Побочная находка при первой попытке создания тенанта**: `DB_ENC_KEY`
в docker-compose был задан как `${JWT_SECRET}` (44 символа) — AES-128-ECB
требует РОВНО 16 байт ключа, из-за чего Erlang-крипто падал с
`{:badarg, "Bad key size"}` → 500 при любой попытке создать/обновить
тенант. Заведена отдельная переменная `REALTIME_DB_ENC_KEY` (ровно 16
байт), realtime-контейнер пересоздан.

**Фикс**:
- `REALTIME_DB_ENC_KEY` (16 байт) в `.env.supabase`, docker-compose
  `DB_ENC_KEY: ${REALTIME_DB_ENC_KEY}`
- `self-hosting/setup-realtime-tenant.sh` — идемпотентный скрипт создания
  тенанта через Admin API (повторный запуск после смены секретов не
  ломает, обновляет существующую запись)

**Проверено**: `curl` WS-хендшейк через полный путь (nginx → Kong →
realtime) — `HTTP/1.1 101 Switching Protocols`. Доставка events в 2
вкладках браузера подтверждена пользователем — работает.

## Фича: регистрация через Telegram-бота /register (2026-07-15)

Пока не работает SMTP, обычная регистрация через сайт (`signUp`) не
работает: GoTrue требует подтверждения email (`GOTRUE_MAILER_AUTOCONFIRM=false`),
письмо никогда не придёт. Добавлена команда `/register` в
telegram-webhook — 3 шага (имя+фамилия → компания → рабочий email) через
`telegram_pending_context` (тот же паттерн, что у визарда `/protocol`),
в конце создаёт аккаунт через GoTrue Admin API с `email_confirm: true`
(подтверждение не требуется) и шлёт временный пароль тем же сообщением.

Протестировано синтетическими curl-запросами к вебхуку (полный цикл:
/register → имя → компания → email → аккаунт создан, профиль заполнен,
логин подтверждён), тестовые данные удалены.

**Побочная находка**: `telegram_pending_context_id_seq` была
рассинхронизирована с `max(id)` после массовой заливки CSV в июле (COPY
с явными id не двигает serial-sequence) — первая же вставка падала с
`duplicate key`. Единственная таблица в схеме с serial/identity PK
(остальные все на UUID), почищена через `setval()`.

## Фича: уведомление в Telegram-группу при архивации проекта (2026-07-17)

Запрос пользователя после завершения проекта «Retail Week 2026»:
1. При архивации проекта слать в привязанный Telegram-чат «Проект
   завершён! Молодцы!» + краткую статистику.
2. Проследить, чтобы еженедельные уведомления не продолжали сыпаться
   по архивированному проекту.

**Реализовано**: новая edge-функция `notify-project-archived`,
вызывается из `closeProject` (`src/hooks/useTasks.tsx`) — только при
переходе В архив (не при снятии), только если у корневого проекта есть
запись в `telegram_group_chats`. Молчит, если чата нет (большинство
проектов без привязки).

**Проверено**: все три еженедельные cron-функции
(`send-weekly-report`, `send-weekly-group-report`,
`send-weekly-ai-review`) уже фильтруют `closed_at IS NOT NULL` —
спама после архивации не будет, отдельных правок не потребовалось.

**Итерация по статистике** (по фидбеку пользователя, с превью текста
в чате перед каждым деплоем):
- Первая версия считала участников по `tasks.assigned_to` — сильно
  занижало (в Retail Week 2026 все 56 задач формально висели на одном
  человеке). Переделано на `group_members` (реальный состав команды,
  6 человек).
- Первая прикидка количества задач (2) считалась только по корневой
  группе вручную при диагностике — сама функция подгруппы уже
  учитывала правильно (`allGroupIds`), итог — 56 задач (7 подгрупп).
- Добавлены: разбивка по направлениям (подгруппам, done/total),
  просрочка (кол-во + средняя задержка в днях), комментарии — с
  адаптивной меткой вовлечённости (≥0.5 коммент/задачу — «высокая
  вовлечённость!», ≥0.15 — «хорошая», иначе без метки).
- Период показан датами (14 апр — 17 июл), не только числом дней.

Протестировано и отправлено на реальный проект: «Retail Week 2026»
(обычный `standard`-проект, 7 подгрупп) архивирован, сообщение с
финальной версией статистики подтверждённо доставлено в чат «Retail
Week '26» (chat_id
-5280782106).
