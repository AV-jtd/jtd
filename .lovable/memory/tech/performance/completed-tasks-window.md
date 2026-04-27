---
name: completed-tasks-window
description: useTasks supports completedWindowDays option to limit how far back completed tasks are fetched. Global TaskList, PMO Portfolio and NPD Board cap at 14 days; project views and search load full history.
type: tech
---
`useTasks(groupId?, filterTags?, { completedWindowDays })`:
- `null`/omit — load all tasks (project views, archive, dashboard)
- `0` — only active tasks
- `N` — active OR completed within last N days (SQL `.or()` with `completed_at.gte`)

Applied: TaskList (non-group views), PortfolioView, NpdBoard → 14 days.
Search uses direct server `ilike` queries — old completed tasks remain searchable.
