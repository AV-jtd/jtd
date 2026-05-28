---
name: kanban-boards
description: Kanban boards integrated with tasks and projects — types, data model, column logic, reuse strategy, access control, and MVP/future roadmap.
type: feature
---

# Kanban Boards Stream

## Goal
Integrate customizable Kanban boards deeply with tasks, projects, and existing modules (CRM pipeline, NPD matrix, PMO portfolio).

## Board Types

1. **Personal** (`owner_id`) — GTD-style personal board. Private to owner.
2. **Project** (`group_id`) — Tied to a project. RLS via `has_project_access`.
3. **Smart** (`filter_json`) — Dynamic cards populated by query (tags, assignee, due date). Read-only board config, cards are live.

## Data Model

```
kanban_boards
  id uuid PK
  name text NOT NULL
  icon text DEFAULT 'LayoutGrid'
  owner_id uuid -> auth.users
  board_type enum('personal','project','smart')
  group_id uuid -> task_groups (NULL for personal/smart)
  filter_json jsonb (NULL for personal/project)
  group_by text (NULL — single board; 'assignee' | 'tag' | 'due_week' — swimlanes)
  is_archived boolean DEFAULT false
  created_at timestamptz DEFAULT now()
  updated_at timestamptz DEFAULT now()

kanban_columns
  id uuid PK
  board_id uuid -> kanban_boards ON DELETE CASCADE
  name text NOT NULL
  color text DEFAULT '#3B82F6'
  position int NOT NULL
  wip_limit int (NULL = no limit)
  mapping_json jsonb (NULL = manual position; else maps column -> task field value)
  created_at timestamptz DEFAULT now()

kanban_card_positions
  board_id uuid -> kanban_boards
  task_id uuid -> tasks
  column_id uuid -> kanban_columns
  position int
  PK (board_id, task_id)
```

## Column Logic (the key decision)

- **Status-driven** (default, `mapping_json` = NULL for `personal`/`project`):
  - Column name maps to `tasks.status` enum value.
  - Dragging a card writes `tasks.status`.
  - Card is visible on board AND in global views (list, calendar, Gantt).
  - This is the default for Personal and Project boards.

- **Custom-driven** (`mapping_json` present):
  - `mapping_json` stores `{ "column_id": "field_value" }` mapping.
  - Drag writes that field on the task (e.g. `npd_gate`, `crm_stage`, custom_field).
  - Used for CRM pipeline, NPD matrix, and any module-specific board.
  - Compatible with existing CRM/NPD logic (drag changes `crm_status`/`npd_gate`).

- **Manual sort** (`mapping_json` = NULL AND `kanban_card_positions` has rows):
  - Position stored in `kanban_card_positions`, same pattern as `npd_card_positions`.
  - Allows arbitrary ordering within a column.
  - Falls back to deadline/priority sort when no position row exists.

## Reuse of Existing Components

| Component | Reuse Strategy |
|------------|----------------|
| DnD | `useBoardDnd`, `BoardColumn`, `DraggableWrapper` — already centralizes sensors |
| Task cards | Compact `TaskCard` → click opens `ProjectDetailPanel` (desktop) / `TaskDetailSheet` (mobile) |
| Manual sorting | Same pattern as `npd_card_positions`: optimistic update + debounced save |
| Smart filters | Same filter engine as Smart filters on main page (tag/assignee/deadline queries) |
| Status values | Reuse `tasks.status` enum: inbox / active / review / done / cancelled / deferred |
| Board UI | 3-column layout (sidebar boards list → board canvas → task detail panel) |

## Integration Points

### CRM Pipeline
- Refactor CRM funnel as a "system" Project board (`board_type = 'project'`, `group_id` = client project).
- Columns = funnel stages (`mapping_json` maps column → `crm_status`).
- Drag creates missing subtasks (existing logic).
- Completed deals stay in "Shipping" column (existing logic).

### NPD Matrix
- Refactor NPD gates as a "system" Project board.
- Columns = gates G0-G5 (`mapping_json` maps column → `npd_gate`).
- Manual card sort inside gate via `kanban_card_positions` (replaces `npd_card_positions` or coexists).

### PMO Portfolio
- Add "Kanban" view button on project page.
- Auto-creates a Project board for that project if none exists.
- Default columns: Inbox → Active → Review → Done.

### Personal Kanban
- Sidebar under ACT phase: "Kanban" item.
- Route: `/kanban/:boardId`.
- Default board per user (auto-created on first visit).

## Access Control (RLS)

- **Personal**: owner only (`auth.uid() = owner_id`).
- **Project**: `has_project_access(group_id)` (same as tasks/comments/chat).
- **Smart**: owner can edit config; viewers see cards filtered by their task access rights.

## MVP Scope

- [ ] Create/edit board name & icon
- [ ] Add / remove / rename columns
- [ ] Column colors
- [ ] WIP limits (visual warning, no hard block)
- [ ] Manual card sorting within columns
- [ ] `group_by` swimlanes (assignee, tag, due week)
- [ ] Status-driven column logic (default)
- [ ] Drag card → change task status
- [ ] Click card → open task detail panel
- [ ] Board list sidebar (personal + accessible project boards)

## Future Scope

- Board templates (Scrum, Kanban, GTD, Getting Things Done)
- Board duplication / copying
- Swimlanes with nested group_by
- Automation rules (when card moves to column X, do Y)
- Time-in-column metrics & CFD charts
- Board sharing (view-only links)

## Notes

- `kanban_card_positions` replaces or coexists with `npd_card_positions` — evaluate migration path.
- Board list in sidebar should show recent / favorited / project-linked boards.
- Mobile: horizontal scroll columns, same bottom-sheet task detail.
