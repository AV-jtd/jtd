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
- [ ] **Шаг 7** — Сброс паролей 55 пользователей + smoke-test
  - 🐛 Найдены и исправлены баги миграции, из-за которых **никто не мог залогиниться**:
    1. `instance_id` был NULL у 54/55 пользователей вместо zero-UUID
    2. Токен-поля (confirmation_token, recovery_token, email_change*, ...) были NULL вместо '' — GoTrue падал с 500 (Go sql.Scan не принимает NULL в string)
    3. `auth.identities` была полностью пустая — досозданы identity-записи provider='email' для всех 55
    4. **Главная причина**: `GOTRUE_JWT_AUD` не был задан в docker-compose.supabase.yml → GoTrue искал пользователей с aud="", а у них aud='authenticated'. Добавлено `GOTRUE_JWT_AUD: authenticated`, auth-контейнер пересоздан.
  - Проверено: вход avedyaev@gmail.com через обычный путь (Kong /sb/auth/v1/token) — 200, валидный access_token
  - SMTP для reset-password писем НЕ работает: `SMTP_PASS=ЗАМЕНИТЬ_ПОЗЖЕ` (плейсхолдер) в .env.supabase — нужен реальный пароль от noreply@justtodoit.ru (smtp.yandex.ru) для варианта A
  - Ждём подтверждения пользователя (вход + проверка задач/проектов), затем решаем по варианту сброса паролей для остальных 54

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
