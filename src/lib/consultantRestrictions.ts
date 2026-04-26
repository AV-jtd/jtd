/**
 * Единый источник правды для ограничений роли `consultant`.
 *
 * Все правила faded/скрытия для внешних пользователей живут здесь.
 * Любая новая кнопка/раздел/роут должны опираться на этот конфиг —
 * тогда правила автоматически применятся ко всем новым категориям
 * внешних пользователей (см. mem://constraints/external-users-default).
 */

/** Стандартное сообщение в tooltip для faded-кнопок. */
export const CONSULTANT_LOCKED_MESSAGE =
  "Доступно только сотрудникам компании";

/** Tailwind-классы для faded-состояния (disabled, но видимого). */
export const CONSULTANT_FADED_CLASS =
  "opacity-40 cursor-not-allowed pointer-events-none";

/**
 * Перечень функциональных областей, закрытых для consultant.
 * Используется как идентификатор для guard-компонентов и роутинга.
 */
export type ConsultantRestrictedArea =
  | "search"            // Глобальный поиск (Cmd+K)
  | "ai-assistant"      // ИИ-ассистент
  | "messenger"         // Мессенджер групп/проектов
  | "project-chat"      // Чат внутри проекта
  | "delegation"        // Отделы/подрядчики (UI делегирования)
  | "tags-management"   // Управление общими тегами
  | "import-export"     // Импорт/экспорт проектов
  | "teams"             // Команды
  | "admin"             // Админка/AdminApproval
  | "calendar-sync"     // Подписка на календарь
  | "pmo" | "npd" | "crm" | "stm" | "protocols" | "wiki"
  | "community" | "subordinates" | "department" | "dashboard" | "archive";

/** Человекочитаемые названия областей для tooltip/сообщений. */
export const AREA_LABELS: Record<ConsultantRestrictedArea, string> = {
  search: "Поиск",
  "ai-assistant": "ИИ-ассистент",
  messenger: "Мессенджер",
  "project-chat": "Чат проекта",
  delegation: "Делегирование",
  "tags-management": "Управление тегами",
  "import-export": "Импорт/Экспорт",
  teams: "Команды",
  admin: "Админка",
  "calendar-sync": "Подписка на календарь",
  pmo: "PMO",
  npd: "NPD",
  crm: "CRM",
  stm: "СТМ",
  protocols: "Протоколы",
  wiki: "База знаний",
  community: "Сообщество",
  subordinates: "Команда",
  department: "Мой отдел",
  dashboard: "Дашборд",
  archive: "Архив",
};

/** Роуты, недоступные для consultant (используется в App.tsx ConsultantBlocked guard). */
export const CONSULTANT_BLOCKED_ROUTES = [
  "/pmo",
  "/npd",
  "/crm",
  "/stm",
  "/protocols",
  "/wiki-demo",
  "/my-department",
] as const;

/** Идентификаторы боковой навигации, которые видит consultant. */
export const CONSULTANT_VISIBLE_NAV_IDS = new Set([
  "all",
  "inbox",
  "myday",
  "assigned",
  "deferred",
  "calendar",
]);

/** Формирует текст tooltip для faded-кнопки. */
export function consultantTooltip(area: ConsultantRestrictedArea): string {
  return `${AREA_LABELS[area]} — ${CONSULTANT_LOCKED_MESSAGE.toLowerCase()}`;
}