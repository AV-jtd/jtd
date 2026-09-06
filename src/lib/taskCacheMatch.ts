/**
 * Подходит ли только что созданная задача под фильтры конкретного кэша списка.
 *
 * Зачем. Оптимистичное добавление раньше вставляло новую задачу во ВСЕ кэши
 * задач сразу, не глядя на их фильтры. Дальше onSettled инвалидировал запросы,
 * повторная выборка применяла настоящие фильтры — и задача исчезала из тех
 * списков, которым не принадлежала. Для пользователя это выглядело так: задача
 * появилась и пропала, будто не сохранилась. При этом в базе она есть.
 *
 * Чаще всего это ловилось так:
 *  - открыт конкретный проект, а задача создана без проекта или в другом;
 *  - включён фильтр по тегам: у новой задачи тегов ещё нет, поэтому повторная
 *    выборка её отбрасывала — воспроизводилось каждый раз.
 *
 * Функция повторяет условия отбора из queryFn в useTasks. Правило простое:
 * лучше не показать сразу (задача появится через мгновение после повторной
 * выборки), чем показать и отобрать.
 */

export type NewTaskShape = {
  group_id?: string | null;
  is_draft?: boolean | null;
  task_type?: string | null;
};

/**
 * key — ключ кэша React Query. Поддерживаются четыре формы:
 *   ["tasks", userId, groupId, filterTags, completedWindowDays]
 *   ["tasks-by-groups", userId, groupIds[], completedWindowDays]
 *   ["stm-stage-tasks", userId]
 *   ["km-stage-tasks", userId]
 * Незнакомые ключи считаем неподходящими: молча вставить в чужой кэш хуже,
 * чем не вставить.
 */
export function taskMatchesCacheKey(key: readonly unknown[], task: NewTaskShape): boolean {
  const kind = key[0];

  if (kind === "stm-stage-tasks") return task.task_type === "stm_stage";
  if (kind === "km-stage-tasks") return task.task_type === "km_stage";

  if (kind === "tasks-by-groups") {
    // Гантт: список задач по набору проектов.
    const groupIds = key[2];
    return Array.isArray(groupIds) && !!task.group_id && groupIds.includes(task.group_id);
  }

  if (kind === "tasks") {
    const groupId = key[2];
    const filterTags = key[3];

    // Список конкретного проекта: только его задачи. Черновики здесь видны —
    // это оговорено инвариантом видимости черновиков в useTasks.
    if (groupId) return task.group_id === groupId;

    // Глобальный список: черновики и задачи матриц STM/KM скрыты.
    if (task.is_draft) return false;
    if (task.task_type === "stm_stage" || task.task_type === "km_stage") return false;

    // Активен фильтр по тегам. У новой задачи тегов ещё нет, а совпадение по
    // проекту с привязанным тегом здесь не проверить — для этого нужен запрос
    // в task_groups. Поэтому не вставляем: если задача под фильтр подходит,
    // повторная выборка её покажет сама.
    if (Array.isArray(filterTags) && filterTags.length > 0) return false;

    return true;
  }

  return false;
}
