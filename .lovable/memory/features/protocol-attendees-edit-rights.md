---
name: protocol-attendees-edit-rights
description: Internal attendees могут править задачи протокола и после публикации (assigned_to, deadline, status). Импорт PDF записывает template_system_key и делает создателя internal_attendee.
type: feature
---

## Бэкенд (RLS)
В дополнение к политикам draft-режима (см. `protocol-internal-scope`) добавлены:
- `Internal attendees can update published protocol tasks` — UPDATE на `tasks` без условия `is_protocol_draft`. Пользователь, числящийся в `protocol_meta.internal_attendees`, может править любые поля задачи протокола (в т.ч. `assigned_to`) и после публикации.
- `Internal attendees can update published protocol subtasks` — то же для `subtasks`.

Без этих политик в опубликованных переговорах/кросс-функциональных встречах никто, кроме создателя протокола (`task_groups.user_id`) или ассайни конкретной задачи, не мог сменить ответственного, и пользователь видел «не сохраняется» при выборе в `AssigneePicker` (`ProtocolTableView`).

## Импорт PDF/текста (`ProtocolImportDialog`)
При создании task_group теперь записывается полный `protocol_meta`:
- `template_system_key: selectedTemplate.system_key` — иначе `ProtocolDetailPage` не отличает `cross_functional` от `client_negotiation` и открывает кросс-функциональный протокол как переговоры (без carry-over плашки и с лишней правой колонкой).
- `internal_attendees: [user.id]` — создатель импорта автоматически получает права internal-attendee (см. RLS выше).
- `meeting_date`, `format`, `external_attendees` — для совместимости с `NewProtocolDialog`.

`guessTemplate` всё ещё подбирает шаблон по ключевым словам в тексте (Дороничи/Магнит → client_negotiation), пользователь может сменить вручную в шаге "template" — итоговый выбор корректно сохранится.
