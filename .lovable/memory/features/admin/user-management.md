---
name: Зона администрирования пользователей
description: AdminApproval (Settings) — полный набор админ-инструментов: поиск, сортировка (date/name/dept), группировка по отделам, фильтр «без отдела», bulk-распределение, инлайн-редактирование имени, аватары-инициалы, удаление через RPC admin_delete_user, история изменений через profile_audit_log + триггер log_profile_changes. Защита: реальных админов (user_roles.role=admin) нельзя деактивировать/удалить.
type: feature
---

# Управление пользователями (Settings → Admin зона)

## Архитектура
- src/components/AdminApproval.tsx — основной компонент
- src/components/admin/UserCard.tsx — карточка
- src/components/admin/UserAvatar.tsx — кружок-инициал (10 цветов, hash по id)
- src/components/admin/AuditHistoryDialog.tsx — диалог истории
- src/components/admin/types.ts — AdminUser, SortMode, GroupMode

## База
- profile_audit_log + триггер log_profile_changes (AFTER UPDATE на profiles, поля display_name/department_id/organization/is_approved/contractor_id/client_id)
- RPC admin_set_users_department(user_ids[], dept_id) — bulk
- RPC admin_delete_user(target_user_id) — DELETE FROM auth.users; защита: нельзя себя и нельзя другого админа

## Защита админов
adminIds Set из user_roles where role=admin → у таких юзеров кнопки Деактивировать/Удалить disabled, badge admin.

## Bulk
Чекбоксы + bulk-bar при selected.size>0. Один RPC вместо N апдейтов. Главный сценарий — миграция 33 юзеров в отделы.

## Не делать
- Не DELETE напрямую из profiles — только через admin_delete_user RPC (иначе auth.users остаётся)
