---
name: Outlook Add-in MVP — детальный дизайн
description: ⏸ ОТЛОЖЕНО. Архитектура, манифест, API-контракт, флоу авторизации и UI Outlook Web Add-in для JustTODOit. Готов к старту реализации, ждём решения по 3 открытым вопросам.
type: feature
---

# Outlook Add-in MVP — Design Document

⏸ **Статус**: design зафиксирован, реализация отложена. Возвращаемся позже.

## Открытые вопросы перед стартом кода
1. **Privacy & Compliance doc** — формальный документ или секция в README? (метаданные писем = ПДн).
2. **Список пилотных юзеров** для PowerShell `New-App -UserList`.
3. **Refresh-токены** в roamingSettings vs короткоживущие access + еженедельный релогин.

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
- `<Requirements><Set Name="Mailbox" MinVersion="1.5"/></Requirements>` — Exchange 2019.
- `<Permissions>ReadWriteMailbox</Permissions>`.
- `<SourceLocation DefaultValue="https://jtd.lovable.app/outlook/taskpane.html"/>`.
- `VersionOverrides` (Mailbox 1.3): кнопка в Read-режиме письма.
- AppDomains: `https://jtd.lovable.app`, `https://nvfioycpwyzwukvokwql.supabase.co`.

## 4. API-контракт (новые edge functions)
Все функции — `verify_jwt = false`, валидация JWT JustTODOit в коде через `supabase.auth.getUser(token)`.

- **`outlook-auth`** (POST): `{email, password}` → `{access_token, refresh_token, user}`. Проверка `profiles.is_approved`.
- **`outlook-tasks-today`** (GET, Bearer): `[{id, title, deadline, group_name, is_important, priority}]`, лимит 50.
- **`outlook-create-task`** (POST): `{title, description, group_id?, deadline?, outlook_link}` → insert tasks + task_outlook_links.
- **`outlook-link-task`** (POST): `{task_id, outlook_link}` идемпотентно.
- **`outlook-search-tasks`** (GET ?q=): до 20 задач по ILIKE title.

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
1. `Office.onReady` → `roamingSettings.get('jtd_jwt')`.
2. Нет токена → `<LoginScreen>`. POST `/outlook-auth` → сохранение токенов в roamingSettings.
3. Есть токен → проверка через `outlook-tasks-today`. На 401 → refresh → если фейл, очистка.
4. Logout очищает roamingSettings.

⚠ roamingSettings шифруются Exchange и привязаны к mailbox. Нужен Privacy doc + retention.

## 7. UI (taskpane 320×600)
- **Шапка**: лого + email + ⋯ (logout).
- **Tab «Сегодня»**: карточки задач, клик → `displayDialogAsync` → `https://jtd.lovable.app/?task=<id>`.
- **Tab «Письмо»** (только в Read): subject + from. Две кнопки:
  - `[+ Создать задачу]`: title=subject, description=тело trimmed 2k, выбор проекта, дедлайн 1-30 дней.
  - `[🔗 Привязать к задаче]`: поиск + список → `outlook-link-task`.

Дизайн-токены HSL синхронизированы с основным app. Light/Dark через `Office.context.officeTheme`.

## 8. Деплой
1. `cd outlook-addin && npm run build` → `../public/outlook/`.
2. `https://jtd.lovable.app/outlook/taskpane.html` + `manifest.xml`.
3. PowerShell:
```powershell
$ManifestUrl = "https://jtd.lovable.app/outlook/manifest.xml"
New-App -OrganizationApp -Url $ManifestUrl -DefaultStateForUser Enabled `
  -ProvidedTo SpecificUsers -UserList "user1@company.com","user2@company.com"
```
Откат: `Remove-App -Identity <AppId>`.

## 9. Тестирование
- Unit: `auth.ts`, `api.ts`.
- Sideload: OWA → ⚙ → Manage add-ins → Add from URL.
- Smoke: открыть письмо → Today показывает задачи → создать задачу → проверить в JustTODOit.

## 10. Roadmap после MVP
- **Level 1**: `email_body_text/html` в task_outlook_links → ai-assistant инжектит в prompt.
- **Level 2**: pgvector для семантического поиска по телам.
- **Compose-режим**: создавать письмо из задачи.
- **Notifications**: непрочитанные комменты в add-in.

## 11. Следующие шаги (когда вернёмся)
1. Решить 3 открытых вопроса (Privacy, пилотные юзеры, refresh).
2. Применить миграцию `task_outlook_links`.
3. Создать 5 edge functions.
4. Завести `/outlook-addin` со скелетом vite + manifest.
5. Реализовать LoginScreen + HomeScreen + TodayList.
6. Реализовать EmailPanel + LinkExistingDialog.
7. Sideload-тест в OWA.
