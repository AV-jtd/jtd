---
name: Карточка клиента CRM
description: Профиль клиента в правой панели чата (ClientContextPanel). Что выводим из реальных данных, что derive, и плейсхолдеры на будущее.
type: feature
---

# Карточка клиента CRM

Единый «профиль» клиента живёт в `src/components/chat/ClientContextPanel.tsx` — правая панель в `ChatFullscreen` (и вкладка «Инфо» на мобильном). Открывается кликом по строке в `CrmClientsList` (вся строка кликабельна → `/chat/<groupId>` CRM-комнаты).

## Реально из данных (clients + связи)
- **Логотип**: смена через кнопку-камеру на аватаре. Загрузка в публичный bucket `protocol-logos` (новый public-bucket создать нельзя — workspace блокирует), путь `${user.id}/client-<clientId>-<ts>.<ext>`, запись `clients.logo_url`. Подхватывается везде через `ClientAvatar`.
- **Контакты инлайн-редактируемые**: `contact_name / phone / email / city` (компонент `EditableContactRow`, мутация update clients, инвалидация client_context/client_room_info/clients/crm_clients/chat_rooms).
- **Ссылка/сайт**: поле `clients.website` (инлайн-редактирование, иконка Globe). Внешние ссылки открываются в новой вкладке; http(s) добавляется автоматически.
- **Теги-пиллы**: rank (primary), territory, retail_type.
- **KPI**: В работе / Просрочено / Готово по `tasks.client_id`.
- **Команда**: `client_assignments` + ответственный `manager_id`.
- **Ключевые задачи**: lightweight-список, клик → onNavigateToTask.
- **Лента активности**: последние сообщения CRM-комнаты (`group_messages` по group_id комнаты project_type='crm_client').

## Derive (структура есть, данных может не быть)
- **Этап воронки**: из шагов (`subtasks`) CRM-задачи воронки (`task_type='crm'`) — первый незавершённый шаг + % прогресса.
- **Протоколы/встречи**: `task_groups` по `tasks.source_protocol_id` задач клиента. Сейчас пересечений ~0 → пустое состояние.

## Плейсхолдеры «скоро»
Контактные лица и роли, Сделки и выручка, Документы, История взаимодействий, Бренды и категории, Заметки.

## NB
- Bucket для лого — `protocol-logos` (public-buckets создавать нельзя). Паттерн как в `ProtocolHeader.handleClientLogoUpload`.
- В мессенджере CRM-комната = pill «Клиент» (Thread.groupProjectType==='crm_client').
- **Мобильная шапка (без дублей)**: в `ChatFullscreen` на мобильном НЕТ внешней шапки — единственная шапка это шапка комнаты (`ClientRoomCenter`/`ProjectRoomCenter`). Навигация: back→список, кнопка Info (md:hidden)→карточка клиента, home в шапке списка (`ChatRoomsList onHome`). Панель «Инфо» получает свою лёгкую шапку с back→чат.
