---
name: clients-shared-registry
description: Клиенты — общий справочник без дублей. Персональные настройки в client_assignments. RPC upsert_client_by_name.
type: feature
---
# Клиенты: общий справочник

## Архитектура
- `clients` — единая запись на одно юрлицо. Уникальный индекс `clients_lower_name_uniq` по `lower(name)` запрещает дубли.
- `client_assignments(user_id, client_id, manager_id, group_id, tag_id, territory_tag_id, retail_type_tag_id, rank_tag_id)` — персональные настройки каждого пользователя по клиенту. UNIQUE (user_id, client_id).
- `clients.user_id` = кто завёл первым (для аудита). Контактные поля (phone, email, city, contact_name, logo_url) — общие.

## Создание клиента
Использовать только RPC: `supabase.rpc("upsert_client_by_name", { _name, _user_id })` → возвращает `client_id`. Не делать `INSERT INTO clients` напрямую — триггер `prevent_duplicate_client` упадёт с 23505.
После получения `client_id` создать/обновить `client_assignments` через `.upsert({...}, { onConflict: "user_id,client_id" })`.

## RLS
- SELECT: все не-консультанты видят весь справочник.
- INSERT: любой не-консультант (становится user_id).
- UPDATE/DELETE: только создатель или admin.
- `client_assignments`: каждый видит свои + admin видит все.

## Где правится
- src/hooks/useTasks.tsx (создание задачи с client_name)
- src/modules/crm/components/CrmSmartImportDialog.tsx (массовый импорт)
- Дроп-селектор в AdminApproval теперь без дедупликации (она невозможна на уровне БД).
