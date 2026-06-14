/**
 * STM (Private Label) workflow stages.
 * Two flows: "in" (new SKU introduction) and "out" (SKU withdrawal).
 * Stage keys are persisted in tasks.stage_key (see migration 20260421172133).
 */

export type StmFlow = "in" | "out";

/** Stage workflow status (stored in tasks.stage_status). */
export type StmStageStatus = "pending" | "in_progress" | "blocked" | "done";

/**
 * "Stuck" threshold in days: how long a SKU may sit on its current stage
 * before it is flagged as a risk. The withdrawal flow is short, so its
 * threshold is tighter.
 */
export const STM_STUCK_THRESHOLD_DAYS: Record<StmFlow, number> = {
  in: 7,
  out: 3,
};

export interface StmStage {
  key: string;
  short: string;
  title: string;
  description: string;
  /** If set, completing this stage marks the corresponding milestone as done. */
  milestoneKey?: "approved" | "ordered";
}

export const STM_IN_STAGES: StmStage[] = [
  { key: "brief",          short: "Бриф",       title: "Бриф / запрос",            description: "Запрос от ритейла, ТЗ, целевые параметры" },
  { key: "sample_request", short: "Запрос обр.", title: "Запрос образцов",          description: "Запрос пробных образцов у поставщика" },
  { key: "sample_send",    short: "Отправка",   title: "Отправка образцов",        description: "Отгрузка образцов клиенту/в сеть" },
  { key: "tasting_1",      short: "Дегу №1",    title: "Дегустация",               description: "Дегустация / приёмка качества" },
  { key: "calc_initial",   short: "Расчёт",     title: "Расчёт цены",              description: "Первичная калькуляция и оффер" },
  { key: "rework",         short: "Доработка",  title: "Доработка по ОС",          description: "Доработка по обратной связи клиента" },
  { key: "approval",       short: "Утвержд.",   title: "Утверждение",              description: "Финальное согласование с сетью", milestoneKey: "approved" },
  { key: "branch_open",    short: "Ветка",      title: "Открытие ветки 1С",        description: "Заведение SKU в учётной системе" },
  { key: "production_run", short: "Пр-во",      title: "Производство",             description: "Запуск производственной партии" },
  { key: "calc_final",     short: "Цена fin",   title: "Финальная цена",           description: "Финальная цена с учётом всех затрат" },
  { key: "label_design",   short: "Макет/ШК",   title: "Макет, ШК, этикетка",      description: "Дизайн упаковки и присвоение штрихкода" },
  { key: "order_release",  short: "Заказ",      title: "Отгрузка / релиз",         description: "Первая отгрузка по заказу", milestoneKey: "ordered" },
];

export const STM_OUT_STAGES: StmStage[] = [
  { key: "notify",   short: "Уведомл.", title: "Уведомление сети",     description: "Письмо ритейлеру о выводе SKU" },
  { key: "sell_off", short: "Распр.",   title: "Распродажа остатков",  description: "Реализация складских остатков" },
  { key: "close",    short: "Закрытие", title: "Закрытие SKU",         description: "Закрытие позиции в 1С и архив" },
];

export function getStmStages(flow: StmFlow): StmStage[] {
  return flow === "out" ? STM_OUT_STAGES : STM_IN_STAGES;
}

/** Aggregate progress: count of completed stage tasks divided by total stages. */
export function calcStmProgress(stageTasks: { stage_key: string | null; is_completed: boolean }[], flow: StmFlow): number {
  const stages = getStmStages(flow);
  const total = stages.length;
  if (!total) return 0;
  const done = stages.filter(s => stageTasks.some(t => t.stage_key === s.key && t.is_completed)).length;
  return Math.round((done / total) * 100);
}

/** Returns "current stage" — first non-completed stage (or last if all done). */
export function currentStmStage(stageTasks: { stage_key: string | null; is_completed: boolean }[], flow: StmFlow): StmStage {
  const stages = getStmStages(flow);
  const firstOpen = stages.find(s => !stageTasks.some(t => t.stage_key === s.key && t.is_completed));
  return firstOpen ?? stages[stages.length - 1];
}

/** STM SKU project metadata stored in task_groups.stm_meta JSONB */
export interface StmMeta {
  flow?: StmFlow;
  retailer?: string;
  brand?: string;
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
}