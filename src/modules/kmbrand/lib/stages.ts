/**
 * KM Brand Control workflow stages.
 * Single linear flow (unlike STM's in/out split) — one 18-gate pipeline
 * from ТЗ to старт продаж. Stage keys are persisted in tasks.stage_key.
 */

/** Stage workflow status (stored in tasks.stage_status). */
export type KmStageStatus = "pending" | "in_progress" | "blocked" | "done";

/** "Stuck" threshold in days: how long a SKU may sit on its current stage before flagged as a risk. */
export const KM_STUCK_THRESHOLD_DAYS = 7;

export interface KmStage {
  key: string;
  short: string;
  title: string;
  description: string;
  /** Visual marker: "flag" for milestone gates, "medal" for the final gate. */
  milestone?: "flag" | "medal";
}

export const KM_STAGES: KmStage[] = [
  { key: "tz_issued",               short: "ТЗ",           title: "Поставлено ТЗ на отработку",       description: "Техническое задание на отработку рецептуры передано" },
  { key: "tasting_1",                short: "Дегуст. 1",    title: "Дегустация 1",                     description: "Первая дегустация образцов" },
  { key: "calc_preliminary",         short: "Расчёт пред.", title: "Предварительный расчёт",           description: "Предварительная калькуляция себестоимости" },
  { key: "tasting_2",                short: "Дегуст. 2",    title: "Дегустация 2",                     description: "Вторая дегустация образцов" },
  { key: "tasting_3",                short: "Дегуст. 3",    title: "Дегустация 3",                     description: "Третья дегустация образцов" },
  { key: "recipe_approved",          short: "Рецепт.",      title: "Рецептура принята",                description: "Итоговая рецептура утверждена", milestone: "flag" },
  { key: "calc_final",               short: "Расчёт fin",   title: "Итоговый расчёт",                  description: "Финальная калькуляция с учётом всех затрат", milestone: "flag" },
  { key: "design_dev",               short: "Дизайн",       title: "Разработка дизайна",               description: "Разработка дизайна упаковки" },
  { key: "declaration_received",     short: "Деклар.",      title: "Получение Декларации",             description: "Получение декларации соответствия" },
  { key: "sg_justification",         short: "СГ",           title: "Обоснование СГ",                   description: "Обоснование срока годности" },
  { key: "ez_received",              short: "ЭЗ",           title: "Получение ЭЗ",                     description: "Получение экспертного заключения" },
  { key: "vm_request",               short: "Заявка ВМ",    title: "Размещение заявки на ВМ",          description: "Заявка на вспомогательные материалы размещена" },
  { key: "presentation_kits_order",  short: "Наборы",       title: "Заказ презентационных наборов",    description: "Заказ презентационных наборов для сети" },
  { key: "presentation_prep",        short: "Презент.",     title: "Подготовка презентации",           description: "Презентация для сети готова", milestone: "flag" },
  { key: "packaging_instruction",    short: "Инстр. упак.", title: "Инструкция по упаковке",           description: "Инструкция по упаковке подготовлена" },
  { key: "vm_production_arrival",    short: "ВМ на пр-во",  title: "Поступление ВМ на производство",   description: "Вспомогательные материалы поступили на производство" },
  { key: "launch_order",             short: "Приказ",       title: "Приказ на ввод",                   description: "Приказ на ввод SKU в ассортимент" },
  { key: "sales_start",              short: "Старт продаж", title: "Старт продаж",                     description: "Первая отгрузка / старт продаж", milestone: "medal" },
];

export function getKmStages(): KmStage[] {
  return KM_STAGES;
}

/** Aggregate progress: count of completed stage tasks divided by total stages. */
export function calcKmProgress(stageTasks: { stage_key: string | null; is_completed: boolean }[]): number {
  const total = KM_STAGES.length;
  if (!total) return 0;
  const done = KM_STAGES.filter(s => stageTasks.some(t => t.stage_key === s.key && t.is_completed)).length;
  return Math.round((done / total) * 100);
}

/** Returns "current stage" — first non-completed stage (or last if all done). */
export function currentKmStage(stageTasks: { stage_key: string | null; is_completed: boolean }[]): KmStage {
  const firstOpen = KM_STAGES.find(s => !stageTasks.some(t => t.stage_key === s.key && t.is_completed));
  return firstOpen ?? KM_STAGES[KM_STAGES.length - 1];
}

/** KM Brand Control SKU project metadata stored in task_groups.km_meta JSONB */
export interface KmMeta {
  retailer?: string;
  brand?: string;
  /** Project / collection grouping. */
  project?: string;
  contract_id?: string;
  drop?: string;
  weight_kg?: number;
  package_type?: string;
  barcode?: string;
  sku_code_1c?: string;
  plu?: string;
  manager_id?: string;
  target_price?: number;
  shelf_life?: string;
  purpose?: string;
  /** SKU lifecycle status (see KM_LIFECYCLE). */
  lifecycle?: KmLifecycle;
}

/**
 * SKU lifecycle status — drives the status menu in the matrix.
 * "stop" and "withdrawn" move the SKU to the archive (task_groups.closed_at).
 * Only "stop" requires a mandatory comment.
 */
export type KmLifecycle = "working" | "approved" | "introduced" | "stop" | "withdrawn";

export interface KmLifecycleOption {
  key: KmLifecycle;
  label: string;
  /** Archives the SKU (hides it from the active list). */
  archives: boolean;
  /** Requires a non-empty comment before it can be set. */
  requiresComment: boolean;
  /** Semantic tone for badges/dots. */
  tone: "muted" | "primary" | "success" | "warning" | "destructive";
}

export const KM_LIFECYCLE: KmLifecycleOption[] = [
  { key: "working",    label: "В работе / доработка", archives: false, requiresComment: false, tone: "primary" },
  { key: "approved",   label: "Согласовано к вводу",  archives: false, requiresComment: false, tone: "success" },
  { key: "introduced", label: "Введено",             archives: false, requiresComment: false, tone: "success" },
  { key: "stop",       label: "Стоп от сети",         archives: true,  requiresComment: true,  tone: "destructive" },
  { key: "withdrawn",  label: "Выведено",            archives: true,  requiresComment: false, tone: "muted" },
];

/**
 * Resolve the effective lifecycle status for a SKU.
 * Falls back for legacy rows that predate the lifecycle field:
 * archived → "stop", active → "working".
 */
export function resolveKmLifecycle(meta: KmMeta | undefined, archived: boolean): KmLifecycle {
  const explicit = meta?.lifecycle;
  if (explicit && KM_LIFECYCLE.some(o => o.key === explicit)) return explicit;
  return archived ? "stop" : "working";
}

export function getKmLifecycleOption(key: KmLifecycle): KmLifecycleOption {
  return KM_LIFECYCLE.find(o => o.key === key) ?? KM_LIFECYCLE[0];
}
