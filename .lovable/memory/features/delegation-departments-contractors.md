---
name: delegation-departments-contractors
description: Делегирование задач на отделы и подрядчиков. Таблицы departments и contractors, поля tasks.department_id/contractor_id, AssigneePicker (табы), AssigneeBadge. Только метка, без уведомлений.
type: feature
---

# Делегирование отделам и подрядчикам

## Модель данных
- **`departments`** (user-scoped): name, description, color, icon, head_user_id, position. Уникальность по (user_id, lower(name)).
- **`contractors`** (user-scoped): name, organization, contact_name, email, phone, notes, color, position.
- **`tasks.department_id`** uuid → departments(id) ON DELETE SET NULL
- **`tasks.contractor_id`** uuid → contractors(id) ON DELETE SET NULL
- Поле `external_assignee` (jsonb) сохранено для обратной совместимости в строках протоколов.

## RLS
- Каждый пользователь управляет своими записями (`auth.uid() = user_id`).
- Все авторизованные могут видеть отделы и подрядчиков (для назначения).
- Админы — полный доступ.

## Компоненты
- `useDepartments`/`useCreateDepartment`/`useUpdate.../useDelete...` — `src/hooks/useDepartments.tsx`
- `useContractors` — аналогично, `src/hooks/useContractors.tsx`
- `AssigneePicker` (`src/components/AssigneePicker.tsx`) — табы Сотрудник/Отдел/Подрядчик. Возвращает `{ kind: "user"|"department"|"contractor"|null, id }`.
- `AssigneeBadge` (`src/components/AssigneeBadge.tsx`) — чип отображения отдела (Building2) / подрядчика (HardHat).
- `DelegationPanel` (`src/components/DelegationPanel.tsx`) — CRUD-секция в Настройках.

## Семантика
- Делегирование на отдел/подрядчика — **только метка**. Никаких notify-event, push, telegram.
- В UI: один из трёх вариантов одновременно — `assigned_to` ИЛИ `department_id` ИЛИ `contractor_id`. AssigneePicker автоматически очищает остальные при выборе.
- Удаление отдела/подрядчика → ON DELETE SET NULL → задача остаётся, метка просто пропадает.

## Где подключено
- ✅ Settings → раздел «Делегирование»
- ✅ TaskItem, QuickCreateForm
- ✅ TaskCreateBar (главная строка быстрого создания задач)
- ✅ ProjectDetailPanel → быстрое добавление задачи в проект
- ✅ NPD MatrixTaskRow
- ✅ Строка протокола → колонка «Ответственный» (секции «Отдел» и «Подрядчик» в локальном AssigneePicker)
- ✅ Раскрытый контекст строки протокола → чип «Участники» (секция «Отделы»: toggle разворачивает в head + членов user_departments через batch insert/delete в task_participants)
- ⏳ CRM-специфичные пикеры — точечно по требованию.
