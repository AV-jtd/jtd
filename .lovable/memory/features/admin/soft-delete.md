---
name: admin-soft-delete-users
description: Удаление пользователей в админке выполняется как soft-delete (профиль помечается deleted_at + is_approved=false). Восстановление в той же админке. Отдельная команда «Удалить навсегда» вызывает hard-delete через auth.users.
type: feature
---

# Soft-delete пользователей

## Поведение
- Кнопка «Удалить» в `AdminApproval` → RPC `admin_soft_delete_user`. Профиль остаётся, но:
  - `profiles.deleted_at = now()`, `deleted_by = auth.uid()`;
  - `profiles.is_approved = false` → существующий `PendingApproval` гард не пускает в приложение;
  - запись в `profile_audit_log` (`field_name='deleted_at'`, `action='soft_delete'`).
- Все задачи/проекты/комментарии удалённого **остаются видимыми** коллегам (имя, авторство, история сохранены).
- Удалённые показываются в `AdminApproval` в свернутой секции «Удалённые пользователи».
  - Кнопка «Восстановить» → RPC `admin_restore_user` (снимает `deleted_at`, ставит `is_approved=true`).
    Право: тот, кто удалил, ИЛИ real-admin (admin с выключенной симуляцией).
  - Кнопка «Удалить навсегда» → RPC `admin_hard_delete_user`. Это `DELETE FROM auth.users` с каскадом.
    Необратимо. Используется только для GDPR/окончательной очистки.
- Старая RPC `admin_delete_user` сохранена для обратной совместимости, теперь делегирует в `admin_soft_delete_user`.

## Защиты (одинаковые для всех трёх RPC)
- Только admin может вызывать.
- Нельзя удалить себя.
- Нельзя удалить другого admin.

## Срок хранения
Бессрочно (по решению пользователя). Cron автоудаления нет — ручное действие.

## Связи
- Колонки `profiles.deleted_at`, `profiles.deleted_by` — добавлены миграцией.
- Хелпер `is_user_active(uuid)` — на будущее (фильтрация активных пользователей).
- См. также `mem://features/admin/user-management`.
