---
name: outlook-web-addin-stream
description: Стрим интеграции с Outlook Classic через Web Add-in без Azure AD, публикация через on-prem Exchange mail.doronichi.com, поэтапный ИИ-контекст переписок.
type: feature
---

# Outlook Web Add-in (без Azure)

## Контекст
- Корпоративный on-prem **Exchange 2019** (build 15.2.2562.35) на `mail.doronichi.com`
- Доступны endpoints: `/EWS/Exchange.asmx`, `/api/`, `/autodiscover/`, `/owa/`
- Авторизация на Exchange: Basic Auth (заявлено), также NTLM/Negotiate
- Юзеры сидят в Outlook Classic + Windows
- Решено: НЕ делать свой почтовый клиент в JustTODOit, НЕ делать COM-надстройку

## Выбранное направление
**Office Web Add-in** (HTML+JS, наш React-стек) — панель внутри Outlook.
- БЕЗ Azure AD — авторизация в JustTODOit через логин/пароль JustTODOit, JWT хранится в `Office.context.roamingSettings`
- Раздача через **Exchange admin** (PowerShell `New-App` на on-prem Exchange), не через Microsoft 365 admin center
- Манифест и фронт хостятся на Lovable Cloud (статика + HTTPS)
- Доступ к письму через **Office.js** (subject, body, sender, conversationId, attachments)

## Сценарии MVP
1. Кнопка "В JustTODOit" в ленте письма → создание задачи (subject → title, body → description, sender → assignee если найден)
2. Панель "Связанные задачи" — показывает задачи, привязанные к conversationId открытого письма
3. Привязка существующей задачи к треду
4. Открытие задачи в JustTODOit (deeplink)

## Технические решения
- Манифест: XML (Office Add-in Manifest v1.1), команды Read/Compose mode
- Размер панели: right-pane 320×450 (стандарт)
- Endpoints в JustTODOit (нужно сделать):
  - `POST /api/outlook/login` — обмен email+пароль JustTODOit на JWT
  - `POST /api/outlook/tasks` — создание задачи из письма
  - `GET /api/outlook/tasks?conversationId=...` — поиск задач по треду
  - `POST /api/outlook/tasks/:id/link` — привязка треда к задаче
- Хранение связи: новая таблица `task_outlook_links (task_id, conversation_id, message_id, subject, sender_email, created_at)`

## План на 2-3 недели
- **Неделя 1**: манифест + sideload + базовая панель (React) + endpoint `/login` + хранение JWT в roamingSettings
- **Неделя 2**: создание задачи из письма + поиск/привязка по conversationId + UI панели в обоих режимах (Read/Compose)
- **Неделя 3**: публикация через Exchange admin (PowerShell), тестирование на 3-5 юзерах, доработка по обратной связи

## ИИ-контекст переписок (поэтапно)

Архитектура того, насколько глубоко ИИ JustTODOit "видит" переписку, привязанную к задаче.

### Этап 0 — Якорь (входит в MVP)
- Сохраняем только **метаданные** письма: `conversationId`, `message_id`, `subject`, `sender_email`, `received_at`, `deeplink_owa`
- ИИ знает: "к этой задаче привязано письмо от X с темой Y, открыть в Outlook"
- Содержимого письма ИИ не видит
- Privacy: минимальный риск, тела писем не покидают Exchange

### Этап 1 — Снимки тел писем (сразу после MVP) ← **ВЫБРАНО**
- В момент создания/привязки задачи делаем snapshot тела письма: `email_body_text`, `email_body_html`, `snapshot_at`
- Расширяем `task_outlook_links`: + `email_body_text TEXT`, `email_body_html TEXT`, `snapshot_at TIMESTAMPTZ`
- В `ai-assistant` edge function при запросе про задачу подтягиваем связанные письма и инжектим в system prompt блоком "📧 Связанные письма" (RAG-pattern)
- Лимит: 5 последних писем на задачу, каждое усечено до ~2000 символов в промпте
- UI: в карточке задачи показываем индикатор "📧 N писем (тела сохранены)" с возможностью развернуть/удалить
- Privacy: тела писем хранятся в нашей БД, защищены RLS (только участники задачи видят)

### Этап 2 — Семантический поиск по всей переписке (через 2-3 недели после Этапа 1)
- pgvector на Supabase, embeddings через `text-embedding-3-small`
- Индексируем все сообщения тредов, на которые ссылаются задачи
- ИИ ищет релевантные письма по смыслу запроса, а не только привязанные напрямую
- Стоимость: ~$0.02 на 1000 писем (embeddings) + storage

### Текущий выбор
**MVP = Этап 0**, сразу после стабилизации MVP → **Этап 1**. Этап 2 — отложен до явного запроса.

## Ограничения
- Не работает оффлайн (нужен HTTPS до JustTODOit API в момент использования)
- На Win7/8 — IE-рендерер, могут быть глюки CSS (на Win10/11 — WebView2, ок)
- В новом Outlook for Windows работает (это плюс vs COM)

## PowerShell для IT (публикация через on-prem Exchange)
```powershell
# Подключение к Exchange Management Shell
# Установка надстройки для всей организации:
New-App -OrganizationApp -Url "https://justtodoit.ru/outlook-addin/manifest.xml" -DefaultStateForUser Enabled

# Или для конкретных юзеров (пилот):
New-App -Url "https://justtodoit.ru/outlook-addin/manifest.xml" -Mailbox "user@doronichi.com"

# Проверка:
Get-App -OrganizationApp

# Удаление:
Remove-App -OrganizationApp -Identity "<AppId>"
```

## Статус
- [x] Разведка mail.doronichi.com — Exchange 2019, endpoints доступны
- [x] Решение: Web Add-in без Azure, не COM, не свой клиент
- [x] Стратегия ИИ-контекста: поэтапно (Этап 0 → Этап 1 → опц. Этап 2)
- [ ] Старт разработки MVP (ждёт подтверждения Артёма)
