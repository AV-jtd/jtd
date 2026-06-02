---
name: max-messenger-channel
description: MAX мессенджер (VK) как +1 альтернативный канал рядом с Telegram — бот, чаты проектов, единый поток TG↔MAX↔JTD.
type: feature
---

# MAX мессенджер — альтернативный канал (стрим)

**Статус:** ⏸ согласован концептуально, ждём решения по этапам/токену. План реализации составлен.

**Ключевой принцип:** MAX — НЕ замена Telegram, а **+1 параллельный канал**. Telegram остаётся основным и работает как есть. Пользователь может привязать оба, один или ни одного.

## API MAX (dev.max.ru)
- Домен `platform-api.max.ru`, токен бота в заголовке `Authorization: <token>` (НЕ в query).
- НЕ в Lovable connector gateway → работаем напрямую с токеном `MAX_BOT_TOKEN` (как сейчас с `TELEGRAM_BOT_TOKEN`).
- Зеркалит Telegram: `POST /messages` (отправка), `POST /subscriptions` (webhook, только HTTPS+доверенный серт), `GET /updates` (long polling — только dev), inline_keyboard (callback/link/request_contact/open_app), Markdown/HTML, лимит 30 rps.
- `request_contact` + HMAC-SHA256(token, vcf_info) → проверка номера = альтернатива авторизации (надёжнее TG).

## Архитектура наложения на JTD
- `profiles.max_user_id` / `profiles.max_chat_id` (рядом с telegram_*).
- `group_messages.source` уже есть → добавить значение `'max'`.
- `notification_preferences`: дублировать telegram-флаги как `max_*`.
- Единый чат: `group_messages` = источник правды, fan-out во все привязанные каналы (TG, MAX), подавление эха по sender_user_id.
- Webhook через `justtodoit.ru` (certbot уже есть) или supabase functions URL.

## Главный технический нюанс
telegram-webhook = 3440 строк с большим набором команд. Чтобы не дублировать — вынести messenger-agnostic ядро обработки команд + тонкие транспорт-адаптеры (TG/MAX). Это основной объём работ.

## Что уже сделано (Этап 1)
- Миграция: profiles.max_user_id/max_chat_id, notification_preferences.max_* (4 события + max_group_chat_message), таблица max_link_tokens (1 час TTL, RLS по auth.uid()).
- `_shared/max-api.ts`: sendMaxMessage (header `Authorization: <token>` без Bearer, POST /messages?user_id=), getMaxBotInfo (GET /me).
- Edge `max-webhook`: actions bot_info/setup_webhook + обработка bot_started/message_created → привязка по токену.
- `notify-event`: MAX-доставка рядом с Telegram (maxPrefKey, max_chat_id/max_user_id, format html).
- Settings → секция «MAX»: MaxLinkCard (привязка по коду + тумблеры уведомлений MAX). config.toml: max-webhook verify_jwt=false.
- Секрет MAX_BOT_TOKEN сохранён. Бот `@id540819302807_bot`.

## Что уже сделано (Этап 2 — общее ядро команд)
- `_shared/messenger-core.ts`: messenger-agnostic ядро.
  - **MessengerTransport** (интерфейс send) + адаптеры `makeTelegramTransport` / `makeMaxTransport` (поверх sendMaxMessage).
  - Чистые хелперы: extractBotCommand, parseDeadline, formatDate, fuzzyMatch, levenshtein, escapeMarkdown, normalizeToken/nameTokens/expandWithAliases (NAME_ALIASES), findMemberByName, detectBulkMessage, pluralizeRu.
  - DB-хелперы: getGroupMemberIds, getProjectMembers, getUserProjects, findProject.
  - AI/создание: aiBulkParse (gemini-2.5-flash, tool extract_tasks), createBulkTasks (assignee+participants+subtasks, task_participants sync).
  - `handleCoreCommand`: /help · /start · /projects · /my (глобально) · /tasks Проект.
  - `handleBulkText`: проект в первой строке → aiBulkParse → createBulkTasks; голый /spisok даёт подсказку.
- `max-webhook` теперь маршрутизирует входящие message_created привязанного MAX-юзера через ядро: команда → handleCoreCommand, иначе → handleBulkText; bot_started для привязанного = меню. profileIdForMaxUser резолвит profiles.max_user_id.
- Telegram-webhook (3440 строк) НЕ трогали — рабочий прод. Миграция TG на ядро отложена (риск), дубли хелперов осознанные.
- Деплой max-webhook прошёл (ядро компилируется).

## Что уже сделано (Этап 3 — команды MAX: /done + inline-кнопки)
- `_shared/max-api.ts`: `sendMaxMessage` принимает `keyboard` (attachments type=`inline_keyboard`, кнопки type=`callback`), новый `answerMaxCallback(token, callbackId, notification?, newText?)` → POST `/answers?callback_id=`.
- `_shared/messenger-core.ts`:
  - `MessengerTransport.sendWithButtons(text, InlineButton[][])` — опционально; реализован в TG (reply_markup.inline_keyboard) и MAX адаптерах.
  - `completeTask(supabase, taskId)`, `assignSelf(supabase, taskId, userId)`, `handleCorePayload({payload})` (роутит `done:<id>` / `assign:<id>`, возвращает строку-нотификацию).
  - `handleCoreCommand` принял опц. `saveList`/`loadList`; `/my` и `/tasks` сохраняют упорядоченные id и шлют кнопки `✅ N` (+ `👤 N взять` в /tasks); добавлена команда `/done N` (несколько: `/done 1 3`).
- Таблица `messenger_list_context (channel, external_id, user_id, task_ids[], updated_at)` PK(channel,external_id), только service_role, RLS on без политик. Хранит last-list для нумерации `/done N`.
- `max-webhook`: обрабатывает `update_type=message_callback` (callback.user.user_id, callback.payload → handleCorePayload → answerMaxCallback); message_created прокидывает saveMaxList/loadMaxList в ядро; setup_webhook теперь подписывается и на `message_callback` (пере-вызван, success). Деплой прошёл, синтетический колбэк → bound:false без ошибок.

## Этап 4 (дальше)
## Telegram: нумерация /done через messenger_list_context
## Назначение ответственного без проекта (fallback)
- `getTeamMembers(supabase, userId)` в `_shared/messenger-core.ts`: union участников всех проектов юзера (owned + member-of) + владельцы + сам юзер.
- `handleBulkText`: если проект не распознан (groupId null) — members берутся из getTeamMembers, иначе @упоминания не резолвились (задача в Inbox шла без ответственного). MAX исправлен. (TG-приватка имеет ту же старую логику в своём webhook — пока не трогали.)
- MAX bulk-create теперь не создаёт задачи без ответственного: перед insert общий core явно ищет `@username`/имя/последнее слово в исходной строке, а если никого не нашёл — ставит автором задачи текущего MAX-пользователя.

- `telegram-webhook` теперь использует общую таблицу `messenger_list_context` (channel=`telegram`, external_id=`chatId`) для нумерации.
- Хелперы `saveTgList`/`loadTgList` (модульного уровня, не трогают 3440-строчное ядро).
- `/tasks` и групповой `/my` сохраняют упорядоченные id показанного списка.
- `/done N` сперва резолвит N по сохранённому контексту (с проверкой is_completed), фолбэк — прежний пересчёт по position. Деплой прошёл.

- Перевести telegram-webhook на общее ядро (постепенно, по командам).
- Единый чат TG↔MAX↔JTD: подключить MAX к fan-out (`send-chat-telegram` рассылает веб-сообщения в личку TG; нужен аналог для MAX + подавление эха).

## Этап 4 (в работе) — Единый чат: нативные группы TG/MAX ↔ JTD (ChatOps)
- Решение: нативные группы на проект (не релей в личку), TG+MAX сразу, ChatOps как основа.
- Миграция применена: `task_groups.telegram_group_chat_id`(bigint uniq), `max_group_chat_id`(text uniq), `chat_mirror_enabled`(bool def true); `group_messages` — `user_id` теперь nullable + `external_author` + `external_message_id` (uniq dedup по source+external_message_id); таблица `chat_link_tokens`(code PK, group_id, channel, created_by, expires_at 1ч, RLS by created_by).
- `_shared/messenger-core.ts` доп. функции: resolveGroupByChat, resolveProfileByExternalUser, linkGroupChat, unlinkGroupChat, mirrorIncomingGroupMessage, fanOutToGroups, handleGroupMessage. handleBulkText получил `fixedProject` (контекст проекта = группа, без парса первой строки).
- ChatOps в группе: `/link КОД` /`/unlink`; `/new|/task|/spisok` создают задачи в проекте группы; `/my /tasks /done N` скоупятся на проект (bare /tasks = проект группы); обычный текст = чат → mirror в group_messages + fanout в другой канал. Эхо: доставка во все каналы КРОМЕ источника.
- max-webhook: задеплоен, ловит групповые message_created (recipient.chat_type==='chat'), список /done N по external_id=`max:<chatId>`.
- ОСТАЛОСЬ: (1) telegram-webhook (3510 стр) — ранняя ветка для групп (chat.id отриц.), reuse тех же core-функций; (2) send-chat-telegram — при наличии linked group постить в группу TG+MAX и пропускать per-user DM (DM только для персональных уведомлений); (3) UI «Каналы чата» в настройках проекта (генерация кода в chat_link_tokens client-side, отвязка); (4) фронт group_messages — показ external_author + бейдж канала; (5) BotFather: выключить Privacy Mode у TG-бота для полного зеркала; проверить MAX группы API.
