---
name: Outlook Add-in MVP — детальный дизайн
description: Архитектура, манифест, API-контракт, флоу авторизации и UI Outlook Web Add-in для JustTODOit. Перед кодом — фиксация всех решений.
type: feature
---

# Outlook Add-in MVP — Design Document

## 1. Решения (зафиксировано)
- **Структура**: отдельная папка `/outlook-addin` в монорепо JustTODOit.
- **Среда**: OWA + Outlook Desktop (Windows) на Exchange 2019 on-prem. Без Azure AD.
- **Объём MVP**: Login (email/password) → Список «Мои задачи на сегодня» → Кнопка «Создать задачу из письма» → Привязка письма к задаче.
- **Уровень контекста писем**: Level 0 (только метаданные `conversationId`, `subject`, `from`, `received_at`).
- **Деплой**: статика add-in хостится на основном домене JustTODOit (`https://jtd.lovable.app/outlook/...`), манифест публикуется в Exchange через PowerShell `New-App`.

## 2. Структура папки `/outlook-addin`
```
outlook-addin/
  manifest.xml                 # Office Add-in manifest (TaskPane)
  package.json                 # vite + react + office-js типы
  vite.config.ts               # build output → ../public/outlook/
  tsconfig.json
  src/
    main.tsx                   # bootstrap Office.onReady
    App.tsx                    # router: LoginScreen | HomeScreen
    lib/
      office.ts                # обёртки над Office.context.mailbox
      api.ts                   # вызовы edge functions JustTODOit
      auth.ts                  # roamingSettings: get/set/clear token
    screens/
      LoginScreen.tsx          # email + password, кнопка Войти
      HomeScreen.tsx           # tabs: Today | Email
      TodayList.tsx            # «Мои задачи на сегодня»
      EmailPanel.tsx           # текущее письмо: создать/привязать
      LinkExistingDialog.tsx   # поиск задачи + кнопка Привязать
    styles/
      tokens.css               # дизайн-токены (HSL), light/dark
  public/
    taskpane.html              # entry HTML с подключением office.js CDN
    icons/
      icon-16.png, 32, 64, 80  # иконки манифеста
  README.md                    # инструкции sideload + PowerShell deploy
```

## 3. Манифест (ключевые поля)
- `<Type>TaskPaneApp</Type>`, `<Version>1.0.0.0</Version>`.
- `<Hosts><Host Name="Mailbox"/></Hosts>`.
- `<Requirements><Set Name="Mailbox" MinVersion="1.5"/></Requirements>` — поддержка Exchange 2019.
- `<Permissions>ReadWriteMailbox</Permissions>` — чтение тела/заголовков, доступ к Office.context.mailbox.item.
- `<SourceLocation DefaultValue="https://jtd.lovable.app/outlook/taskpane.html"/>`.
- `VersionOverrides` (Mailbox 1.3): кнопка в Read-режиме письма, ContextLaunchEvent для tab «Создать задачу».
- AppDomains: `https://jtd.lovable.app`, `https://nvfioycpwyzwukvokwql.supabase.co`.

## 4. API-контракт (новые edge functions)
Все функции — `verify_jwt = false`, валидация JWT JustTODOit в коде через `supabase.auth.getUser(token)`.

### `outlook-auth` (POST)
- **Запрос**: `{ email, password }`.
- **Логика**: вызывает `supabase.auth.signInWithPassword`, проверяет `profiles.is_approved`. Возвращает `{ access_token, refresh_token, user: { id, display_name, email } }`.
- **Зачем**: add-in не может использовать GoTrue cookies, нужен явный JWT для roamingSettings.

### `outlook-tasks-today` (GET)
- **Заголовок**: `Authorization: Bearer <jwt>`.
- **Ответ**: `[{ id, title, deadline, group_name, is_important, priority }]` — задачи юзера (assigned_to = me OR user_id = me) c `deadline ≤ end_of_day` и `is_completed = false`.
- **Лимит**: 50.

### `outlook-create-task` (POST)
- **Запрос**: `{ title, description, group_id?, deadline?, outlook_link: { conversation_id, subject, from_email, received_at, web_link? } }`.
- **Логика**: insert в `tasks` (user_id = auth.uid, start_at = now()), затем insert в `task_outlook_links`. Возвращает `{ task_id }`.

### `outlook-link-task` (POST)
- **Запрос**: `{ task_id, outlook_link: {...} }`.
- **Логика**: проверка прав (RLS через user JWT), insert в `task_outlook_links`. Идемпотентно (unique по `task_id + conversation_id`).

### `outlook-search-tasks` (GET ?q=)
- **Ответ**: до 20 задач юзера по ILIKE title, не завершённые. Для диалога «Привязать к существующей».

## 5. Миграция БД (Level 0)
```sql
CREATE TABLE public.task_outlook_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conversation_id text NOT NULL,
  message_id text,
  subject text,
  from_email text,
  from_name text,
  received_at timestamptz,
  web_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, conversation_id)
);
CREATE INDEX idx_outlook_links_task ON public.task_outlook_links(task_id);
CREATE INDEX idx_outlook_links_conv ON public.task_outlook_links(conversation_id);

ALTER TABLE public.task_outlook_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own outlook links"
  ON public.task_outlook_links FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Task viewers can see outlook links"
  ON public.task_outlook_links FOR SELECT
  USING (is_task_owner(task_id, auth.uid())
      OR is_task_participant(task_id, auth.uid())
      OR is_task_in_member_group(task_id, auth.uid()));
```

## 6. Флоу авторизации
1. Open taskpane → `Office.onReady` → `roamingSettings.get('jtd_jwt')`.
2. Нет токена → `<LoginScreen>`. POST `/outlook-auth` → сохранение `access_token` + `refresh_token` в roamingSettings (`saveAsync`).
3. Есть токен → проверка через `outlook-tasks-today`. На 401 → попытка refresh → если фейл, очистка и LoginScreen.
4. Logout кнопка очищает roamingSettings.

⚠ **Безопасность**: roamingSettings шифруются Exchange и привязаны к mailbox. Документировать риск и в Privacy doc указать срок жизни refresh.

## 7. UI (taskpane 320×600)
**Шапка**: лого JustTODOit + email юзера + ⋯ (logout).
**Tabs**:
- **«Сегодня»** (`TodayList`): список карточек с title, проектом (бейдж), временем дедлайна. Клик → `Office.context.ui.displayDialogAsync` → открывает `https://jtd.lovable.app/?task=<id>`.
- **«Письмо»** (`EmailPanel`, активен только в Read-режиме): превью subject + from. Две кнопки:
  - `[+ Создать задачу]` → форма (title prefilled = subject, description = тело trimmed 2k символов, выбор проекта из списка `outlook-tasks-today` метаданных, дедлайн дни 1-30) → POST `outlook-create-task`.
  - `[🔗 Привязать к задаче]` → `LinkExistingDialog` (поиск + список) → POST `outlook-link-task`.

Дизайн-токены (HSL) синхронизированы с основным приложением: `--primary 217 91% 60%`, glassmorphism убрать (Office рендерит в iframe с белым фоном). Light/Dark — через `Office.context.officeTheme`.

## 8. Деплой и публикация
1. `cd outlook-addin && npm run build` → vite пишет в `../public/outlook/`.
2. Основной билд JustTODOit раздаёт статику: `https://jtd.lovable.app/outlook/taskpane.html`.
3. Манифест на сервере: `https://jtd.lovable.app/outlook/manifest.xml`.
4. Exchange admin (PowerShell):
```powershell
$ManifestUrl = "https://jtd.lovable.app/outlook/manifest.xml"
New-App -OrganizationApp -Url $ManifestUrl -DefaultStateForUser Enabled -ProvidedTo SpecificUsers -UserList "user1@company.com","user2@company.com"
```
5. Откат: `Remove-App -Identity <AppId>`.

## 9. Тестирование
- **Unit**: `auth.ts` (roamingSettings mock), `api.ts` (fetch mock).
- **E2E sideload**: OWA → ⚙ → Manage add-ins → Add from URL → manifest.xml.
- **Outlook Desktop**: File → Manage Add-ins (откроет OWA админку).
- **Smoke**: open письмо → Today показывает задачи → создать задачу → проверить в JustTODOit что появилась в проекте Inbox + связь в `task_outlook_links`.

## 10. Roadmap после MVP
- **Level 1**: добавить `email_body_text`, `email_body_html` в `task_outlook_links`. Edge function `ai-assistant` инжектит тело письма в системный prompt при упоминании задачи.
- **Level 2**: `pgvector` индекс по телам писем для семантического поиска.
- **Compose-режим**: создавать письмо из задачи (Office.context.mailbox.item.body.setAsync).
- **Notifications**: показывать в add-in непрочитанные комменты к привязанным задачам.

## 11. Контрольный список перед кодом
- [x] Структура папки утверждена.
- [x] API-контракт зафиксирован.
- [x] Схема таблицы `task_outlook_links` готова.
- [ ] Privacy & Compliance doc (ждёт от Артёма).
- [ ] Финальный список юзеров для PowerShell deploy.

## 12. Следующие шаги (в порядке)
1. Применить миграцию `task_outlook_links` (Supabase).
2. Создать 4 edge functions (`outlook-auth`, `outlook-tasks-today`, `outlook-create-task`, `outlook-link-task`, `outlook-search-tasks`).
3. Завести `outlook-addin/` с Vite-сборкой и манифестом.
4. Реализовать LoginScreen + HomeScreen + TodayList.
5. Реализовать EmailPanel + LinkExistingDialog.
6. Внутренний sideload-тест в OWA.
