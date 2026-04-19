---
name: Chatbot — единый стрим (in-app AI Assistant + Telegram bot)
description: Стрим JTD 2.0. Чат-бот = одна продуктовая поверхность с двумя клиентами (web AiAssistant + @Scope_todo_bot). Единый "мозг" (tool-calling), общий контекст пользователя, разные транспорты. Анализ от 2026-04-19: разделять стримы НЕ надо.
type: feature
---

# Chatbot — стрим

## Тезис
**Один стрим, один движок, два клиента.**
- **Клиент A — In-app**: `src/components/AiAssistant.tsx` + `useAiConversation`, edge `ai-assistant`.
- **Клиент B — Telegram**: `@Scope_todo_bot`, edges `telegram-webhook`, `send-chat-telegram`, `telegram-2fa`.

Оба клиента дёргают один и тот же набор tool-calls над теми же таблицами (`tasks`, `task_groups`, `task_participants`, `task_comments`, `clients`, `tags`). Разделять на два стрима = плодить два промпта, два набора инструментов, два набора регрессий.

## Что уже есть (текущая база)

### In-app
- `supabase/functions/ai-assistant/index.ts` — Lovable AI Gateway (`google/gemini-2.5-flash` по умолчанию, fallback на `openai/gpt-5-mini`), tool-calling: создание/изменение/закрытие задач, поиск, summary проекта, генерация шагов. История бесед в `ai_conversations` (jsonb messages).
- `src/components/AiAssistant.tsx` + `useAiConversation` — глобальный плавающий чат, контекстная подсказка по текущему роуту, треды.
- `AiInsightsCard`, `ai-insights` — проактивные дайджесты (Risk Radar, weekly review).
- `TaskAiPopover`, `NpdAiTasksPopover`, `GanttAiPanel`, `CrmRiskRadar` — точечные AI-инструменты.

### Telegram
- `telegram-webhook` — приём апдейтов (`/start`, `/sp`, голос, фото, текст), `telegram_pending_context` для многошаговых диалогов, парсинг через ту же `ai-assistant` логику, привязка `profiles.telegram_chat_id` через `telegram-2fa`.
- `send-chat-telegram` — исходящие сообщения по чату задачи/проекта.
- `send-protocol-telegram` — рассылка опубликованного протокола (учитывает тумблер «Имена/Стороны»).
- `notify-event` — единая точка push+TG уведомлений по `notification_preferences`.
- `telegram_group_chats`, `telegram_bot_chats` — связь чатов с проектами и пользователями.

### Общие данные/память
- `ai_conversations` (context_type, context_id) — история диалогов в in-app.
- В TG история сейчас ведётся имплицитно (через Telegram), без зеркала в БД.

## Анализ: in-app и Telegram — один стрим или два?

### Аргументы ЗА единый стрим (выбираем этот вариант)

1. **Один промпт = одно поведение.** Пользователь, который сегодня в офисе пишет ассистенту в браузере, а вечером с телефона — в TG, ожидает одинаковых ответов и доступа к одним задачам.
2. **Один набор tool-calls.** Создать задачу, поставить дедлайн, добавить в проект, закрыть с отчётом — это операции над БД, поверхность не важна. Дублировать их в двух стримах = двойная регрессия при изменении схемы.
3. **Один контекст пользователя.** `ai_conversations` уже расчитан на универсальный движок (`context_type`/`context_id`). TG-сообщения логично писать в ту же таблицу с `context_type='telegram'` — тогда история склеена.
4. **Один pricing-узел.** Lovable AI Gateway с тарификацией. Считать токены, выбирать модель, обрабатывать `429/402` — общая логика.
5. **Уведомления уже унифицированы** через `notify-event` (push+TG). Чат-бот должен следовать той же модели «один backend, разные транспорты».

### Аргументы ПРОТИВ (и почему они не перевешивают)

1. *«TG требует webhook, polling, парсинг команд — это инфраструктурно отдельная история»*.
   Да, **транспортный слой** разный (`telegram-webhook` vs HTTP из браузера). Но это слой адаптеров, а не отдельный продукт. Адаптеры вынесем в `chatbot-transport-telegram.ts` и `chatbot-transport-web.ts`, ядро (`chatbot-core.ts`) останется одно.
2. *«TG-специфика: голос → STT, фото → OCR, document → parse»*.
   Это инструменты, доступные обеим поверхностям. Web уже умеет загружать файлы (`process-attachment`). Унифицируем как `tool: ingest_attachment(kind, payload)`.
3. *«В TG групповые чаты, в web — личный assistant»*.
   В web уже есть `ProjectChat` (групповой) и `MessengerPanel`. Разница не в стриме, а в `context_type` (`personal` / `group:<group_id>` / `task:<task_id>`).

### Вердикт
**Один стрим «Chatbot».** Транспорты Telegram и Web — два sub-направления (T-1 и W-1) внутри стрима. Разделение по стримам только усложнит синхронизацию инструментов и контекста.

## Архитектура (целевая)

```
┌─────────────────────────────────────────────────┐
│  Клиенты                                        │
│  ┌──────────────┐    ┌─────────────────────┐    │
│  │ AiAssistant  │    │ @Scope_todo_bot     │    │
│  │ (web/PWA)    │    │ (Telegram)          │    │
│  └──────┬───────┘    └──────────┬──────────┘    │
│         │ HTTP                  │ Webhook       │
└─────────┼──────────────────────┼─────────────────┘
          ▼                      ▼
   ┌──────────────────┐   ┌──────────────────┐
   │ ai-assistant     │   │ telegram-webhook │
   │ (web transport)  │   │ (TG transport)   │
   └────────┬─────────┘   └────────┬─────────┘
            │                      │
            ▼                      ▼
       ┌──────────────────────────────┐
       │    chatbot-core              │
       │  • системный промпт          │
       │  • tool registry             │
       │  • контекст пользователя     │
       │  • история (ai_conversations)│
       │  • Lovable AI Gateway        │
       └──────────┬───────────────────┘
                  ▼
       ┌──────────────────────────────┐
       │  Tool registry (общее)       │
       │  create_task, update_task,   │
       │  search, summary, ingest…    │
       └──────────────────────────────┘
```

## Этапы стрима

### Этап 1 — Аудит и выравнивание (P0)
- Зафиксировать текущий tool-set `ai-assistant`.
- Сравнить с тем, что фактически парсит `telegram-webhook`. Найти расхождения (что умеет TG, чего нет в web — и наоборот).
- Решение: или переносим разрозненную TG-логику в общий tool registry, или оставляем как есть с пометкой.

### Этап 2 — Общий tool registry (P0)
- Вынести список инструментов в `supabase/functions/_shared/chatbot-tools.ts`.
- Оба входа (`ai-assistant`, `telegram-webhook`) импортируют один `getTools(userId, context)`.
- Унифицировать ответ инструмента: `{ ok, data?, error? }`.

### Этап 3 — Единая история диалогов (P1)
- Расширить `ai_conversations.context_type` значением `'telegram'`.
- `telegram-webhook` пишет каждый round-trip в `ai_conversations` с `context_id = telegram_chat_id`.
- В web появляется таб «История из Telegram» в `AiAssistant`.

### Этап 4 — Feature parity TG ↔ Web (P1)
| Фича | Web | TG |
|---|---|---|
| Создание задачи (`/sp`-стиль) | ✅ | ✅ |
| Голос → задача | ❌ | ✅ |
| Фото/документ → задача с вложением | частично | ✅ |
| Inline-кнопки «закрыть/перенести/делегировать» | через UI | ❌ |
| Группа: `@bot` в чате проекта | ❌ | частично |
| Reply на сообщение → коммент в задаче | ❌ | ❌ |
| Показ ежедневного дайджеста | проактивный card | через `send-weekly-ai-review` |

Закрываем gap-ы списком, не переписывая ядро.

### Этап 5 — Telegram inline-actions (P2)
- Кнопки под уведомлением: «✅ Закрыть», «📅 Перенести», «👤 Делегировать», «💬 Ответить».
- Callback-handler в `telegram-webhook` дёргает те же tool-calls.

### Этап 6 — Voice-first capture (P2)
- В web — кнопка микрофона рядом с инпутом `AiAssistant`. STT через Lovable AI (Gemini multimodal) → тот же tool-call.
- В TG голос уже работает; убедиться, что результат идёт через тот же путь.

### Этап 7 — Групповой режим бота (P2)
- `@Scope_todo_bot` в групповом TG-чате привязан к проекту через `telegram_group_chats`.
- Реакции на упоминание: создать задачу из реплая, показать summary проекта, перевести сообщение в комментарий задачи (если reply на уведомление).
- Аналог в web — кнопка «Спросить ассистента о проекте» в `ProjectChat`.

### Этап 8 — Persona и тон (P2)
- Один системный промпт + per-user override (стиль обращения, язык, краткость) в `user_settings`.
- Применяется одинаково в обоих транспортах.

## Безопасность и пейлоад
- Все tool-calls идут через service role в edge функции, но **обязаны** проверять `userId` через RLS-friendly `is_task_owner`/`is_group_member` SECURITY DEFINER функции, которые уже есть.
- TG-привязка через `telegram-2fa` остаётся единственным способом «склеить» chat_id с user_id.
- Rate limiting: in-memory store на edge с TTL (30 сообщений/мин на user_id).

## Что **не** входит в этот стрим
- Web Push уведомления, weekly reports, AI Risk Radar — это `notify-event` и `ai-insights` стримы. Чат-бот их вызывает как клиенты, но не владеет ими.
- Outlook add-in (`mem://features/outlook/web-addin-stream`) — отдельный транспорт со своей семантикой (письмо → задача), не пересекается с интерактивным чатом.

## Зависимости
- **R7 Protocols**: TG-рассылка опубликованного протокола (`send-protocol-telegram`) использует чат-бот как канал доставки; общий формат сообщений.
- **Context model** (`mem://streams/context-model`): чат-бот должен уметь работать с 9 системными категориями тегов (event_topic, clients, territory, …) — это влияет на промпт и tool-set.
- **Lovable AI Gateway**: дефолтная модель `google/gemini-2.5-flash` (быстро/дёшево), эскалация на `openai/gpt-5-mini` для сложных tool-call цепочек.

## Файлы
- `supabase/functions/ai-assistant/index.ts` — web transport.
- `supabase/functions/telegram-webhook/index.ts` — TG transport.
- `supabase/functions/send-chat-telegram/index.ts`, `send-protocol-telegram/index.ts` — исходящие.
- `supabase/functions/telegram-2fa/index.ts` — привязка chat_id.
- `src/components/AiAssistant.tsx`, `src/hooks/useAiConversation.tsx` — клиент web.
- TODO: `supabase/functions/_shared/chatbot-tools.ts` — общий tool registry (Этап 2).
- TODO: `supabase/functions/_shared/chatbot-core.ts` — общий промпт + LLM-вызов (Этап 2).

## Статус
- **База ✅** — обе поверхности работают независимо.
- **Этап 1–8** — ⏳ ждут приоритезации Артёмом.
