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

## Аудит от 2026-04-19 (Артём попросил выяснить, что внедрить из этапа «общий tool registry»)

### Состояние ai-assistant (1741 строк)
13 inline `if (action === ...)` блоков, каждый со своим tool-call. Шаблон одинаковый: fetch → 429/402/error → tool_call → JSON.parse → response. Файл — копипаста boilerplate.

Tool-схемы (action → tool name → возвращаемый формат):
- `parse_task` → `create_task` → `{ action: "parse_task", task }` — фронт инсёртит сам (TaskCreateBar, QuickCreateForm, AiAssistant)
- `plan_project` → `plan_project` → `{ action: "plan_project", plan }` — фронт инсёртит
- `decompose_task` → `suggest_subtasks` → `{ action: "decompose_task", subtasks }` — TaskItem
- `npd_generate_tasks` → `suggest_npd_tasks` → `{ action, streams }` — NpdAiTasksPopover
- `npd_risk_radar` → `report_risks` → `{ summary, risks }` — NpdRiskRadar
- `crm_risk_radar` → `report_crm_risks` → `{ summary, risks }` — CrmRiskRadar
- `pmo_risk_radar` → `report_risks` → `{ summary, risks }` — PmoRiskRadar
- `pmo_portfolio_summary` → отдельный prompt → `{ summary }` — PmoPortfolioSummary
- `fill_section` → `fill_section` → `{ content }` — wiki/StructuredOverview
- `map_columns` → `map_columns` → `{ mapping }` — SmartImportDialog
- `map_crm_columns` → `map_crm_columns` → `{ mapping }` — CrmSmartImportDialog
- `bulk_generate_tasks` → `generate_bulk_tasks` → `{ tasks }` — BulkTaskDialog
- `chat` (свободный) → tools опциональны → `{ message, tool_calls? }` — AiAssistant

**Ключевой инвариант**: ai-assistant **ничего не пишет в БД**. Возвращает draft. Фронт показывает пользователю и инсёртит после подтверждения. Это сознательный GTD-дизайн.

### Состояние telegram-webhook (2427 строк)
Императивные команды через `extractBotCommand` и `if message.text.startsWith(...)`. **Пишет в БД сразу** (в чате нет UI подтверждения).

Команды: /start, /help, /link, /project, /chat, /ai, /spisok (+/s /t /p /d алиасы), /task, /tasks, /done, /assign, /my, /projects.
Спец-обработчики: голос (Whisper STT), forwarded message, auto-detect bulk list, telegram_pending_context (10-мин лок).

### Решение Артёма (2026-04-19)
**Не делаем общий registry сейчас.** Причины:
1. AI-only фичи (read/generate, не CRUD) можно унифицировать, но это чистый рефакторинг ~400 строк boilerplate. Видимой пользы для воркфлоу нет.
2. Риск регрессий в 7 фронтовых компонентах (каждый ждёт строго определённый формат ответа).
3. CRUD не объединить из-за инварианта web=draft / TG=write-immediately.

**Рассматривали альтернативы**:
- Inline-кнопки под TG-уведомлениями → **отвергнуто**, нарушает GTD «кинул-забыл-ревью».
- Голосовой ввод в web → отложено, сомнения в спросе.
- Утренний дайджест в TG → не делаем (см. ниже находку).

### Главная находка: send-weekly-report УЖЕ ежедневный

Функция `supabase/functions/send-weekly-report/index.ts` фактически устроена как ежедневный отчёт ПН-ПТ:
- Фильтрует выходные в коде (return при `dayOfWeek === 0 || 6`).
- Шапка сообщения: `📊 Ежедневный отчёт · DATE`.
- Содержит: прогресс %, дедлайны на неделе, просрочено задач/шагов, drift, список просроченных, список на неделе, шаги без срока/ответственного.
- Сохраняет копию в `dashboard_reports` с `period: "auto_daily"`.

**Но**: cron `send-weekly-review-friday` запускает её только по пятницам в `8 5 * * 5` (08:05 UTC = 11:05 МСК). То есть код рассчитан на ежедневку, но запускается раз в неделю.

Если в будущем захотим включить ежедневный дайджест — просто поменять cron на `0 6 * * 1-5` (09:00 МСК ПН-ПТ). Никакого нового кода не нужно. Артём сказал «не делаем» — оставляем пятничный режим.

Параллельно работают:
- `send-weekly-ai-review-friday` — AI-сводка по неделе, пятница 11:05 МСК.
- `send-weekly-group-report-friday` — групповой отчёт, пятница 11:05 МСК.
- `one-shot-*` — одноразовые тестовые задания.

## Что есть базово (текущая база)

### In-app
- `supabase/functions/ai-assistant/index.ts` — Lovable AI Gateway (`google/gemini-2.5-flash` по умолчанию), tool-calling. История бесед в `ai_conversations` (jsonb messages).
- `src/components/AiAssistant.tsx` + `useAiConversation` — глобальный плавающий чат.
- `AiInsightsCard`, `ai-insights` — проактивные дайджесты на главной.
- `TaskAiPopover`, `NpdAiTasksPopover`, `GanttAiPanel`, `CrmRiskRadar`, `NpdRiskRadar`, `PmoRiskRadar`, `PmoPortfolioSummary` — точечные AI-инструменты.

### Telegram
- `telegram-webhook` — приём апдейтов, голос, фото, текст, `telegram_pending_context` для многошаговых диалогов.
- `send-chat-telegram` — исходящие сообщения по чату задачи/проекта.
- `send-protocol-telegram` — рассылка опубликованного протокола.
- `notify-event` — единая точка push+TG уведомлений по `notification_preferences`.

## Унификация быстрого ввода (готово 2026-04-19)
- `src/lib/quickTaskParse.ts` — общий парсер `@имя`, `+Nд`, `до DD.MM`, `!`, `#тег`.
- Используется: TaskCreateBar, QuickCreateForm, BulkTaskDialog, AiAssistant.
- В `ai-assistant` едет как `quickHints`, прокидывается в system-prompt и применяется как fallback после tool-call (`applyQuickHintsToTask`).
- В `telegram-webhook` `parseDeadline` поддерживает те же форматы (+Nд, до DD.MM[.YYYY]).

## Этапы стрима (на будущее)

### Этап 1 — Аудит ✅ (2026-04-19)
Завершён. См. секцию «Аудит от 2026-04-19» выше.

### Этап 2 — Общий tool registry ⏸ ОТЛОЖЕНО
Артём решил не делать: чистый рефакторинг без видимой пользы, риск регрессий выше выгоды.

### Этап 3 — Единая история диалогов (P1) ⏸
Расширить `ai_conversations.context_type` значением `'telegram'`. TG пишет round-trip в `ai_conversations`.

### Этап 4 — Feature parity TG ↔ Web (P1) ⏸
| Фича | Web | TG |
|---|---|---|
| Создание задачи | ✅ | ✅ |
| Голос → задача | ❌ (отложено) | ✅ |
| Фото/документ → задача с вложением | частично | ✅ |
| Inline-кнопки «закрыть/перенести» | через UI | ❌ (отвергнуто, нарушает GTD) |
| Reply на сообщение → коммент в задаче | ❌ | ❌ |
| Ежедневный дайджест | проактивный card | ❌ (cron только в пт) |

### Этап 5 — Telegram inline-actions ❌ ОТВЕРГНУТО
Нарушает GTD-логику быстрой задачи: «кинул — забыл до вечера/ревью».

### Этап 6 — Voice-first capture ⏸ СОМНЕНИЯ
Артём: «насколько ии функциями вообще попользуются в вебе». Откладываем до сигналов спроса.

### Этап 7 — Групповой режим бота (P2) ⏸

### Этап 8 — Persona и тон (P2) ⏸

## Безопасность и пейлоад
- Все tool-calls идут через service role в edge функции, но **обязаны** проверять `userId` через RLS-friendly `is_task_owner`/`is_group_member` SECURITY DEFINER функции.
- TG-привязка через `telegram-2fa` остаётся единственным способом «склеить» chat_id с user_id.

## Файлы
- `supabase/functions/ai-assistant/index.ts` — web transport (1741 строк, 13 actions).
- `supabase/functions/telegram-webhook/index.ts` — TG transport (2427 строк, 11 команд + спец).
- `supabase/functions/send-weekly-report/index.ts` — фактически ежедневный отчёт, но cron только пт.
- `supabase/functions/send-weekly-ai-review/index.ts` — AI-сводка пт 11:05 МСК.
- `supabase/functions/send-chat-telegram/index.ts`, `send-protocol-telegram/index.ts` — исходящие.
- `src/components/AiAssistant.tsx`, `src/hooks/useAiConversation.tsx` — клиент web.
- `src/lib/quickTaskParse.ts` — общий парсер быстрого ввода (web + ai-hints).

## Статус
- **База ✅** — обе поверхности работают независимо.
- **Унификация быстрого ввода ✅** (2026-04-19).
- **Этап 1 — Аудит ✅** (2026-04-19).
- **Этап 2 — Registry** ⏸ ОТЛОЖЕНО.
- **Этап 5 — inline-actions** ❌ ОТВЕРГНУТО.
- **Этап 6 — Voice web** ⏸ СОМНЕНИЯ.
- **Утренний дайджест** ❌ НЕ ДЕЛАЕМ (хотя инфра готова).
- **Этапы 3, 4, 7, 8** ⏳ ждут приоритезации.
