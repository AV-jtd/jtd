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
