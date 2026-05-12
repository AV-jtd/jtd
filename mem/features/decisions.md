---
name: decisions-cross-app
description: Сквозная сущность "Решения" — таблица decisions + связи с протоколом/проектами/тегами/клиентами + ограниченный круг лиц. Видна в Протоколах, PMO (ProjectDetailPanel), CRM (Sheet).
type: feature
---
Таблицы: `decisions` (protocol_id, source_task_id, title, body, decided_at, status, visibility),
`decision_projects`, `decision_tags`, `decision_clients`, `decision_viewers`.
RLS через `can_see_decision(decision_id, user_id)` SECURITY DEFINER:
- visibility='protocol' → видят участники протокола / связанных проектов / task_participants
- visibility='restricted' → только decision_viewers + автор + админ
Хук `useDecisions({ protocolId?, groupId?, clientId?, tagIds? })` пересекает scopes по child-таблицам.
UI:
- `DecisionDialog` (текст, дата, multi-select проекты/теги/клиенты, видимость + viewers)
- `DecisionsSection` встроена в ProtocolDetailPage (allowCreate), ProjectDetailPanel (по groupId, compact), CrmBoard (Sheet "Решения" в фильтр-баре)
