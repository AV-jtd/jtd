---
name: notification-preferences
description: Настройки уведомлений — 8 task-событий (push+telegram), еженедельные отчёты, и telegram_group_chat_message (по умолчанию выключено).
type: feature
---

`notification_preferences` — построчная настройка маршрутизации уведомлений.

**Task-события (8):** push_* / telegram_* пары — assigned, delegated, participant_added, completed, commented, added_to_group, new_task_in_group, deadline_approaching.

**Telegram-only:**
- `telegram_weekly_report` — пятница 08:08 МСК (default false)
- `telegram_weekly_ai_review` — еженедельный ИИ-обзор (default true)
- `telegram_group_chat_message` — **дублирование сообщений из чата проекта в личку** (default **false**, добавлено 29.04.2026). Edge-функция `send-chat-telegram` фильтрует получателей по этому флагу: рассылает только тем, кто явно opt-in.

UI: `src/pages/Settings.tsx` секция "Уведомления", переключатель в блоке "Автоотчёты в Telegram".
