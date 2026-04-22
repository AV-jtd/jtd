/**
 * Канонические имена 8 NPD-стримов, которые автоматически создаются как
 * подпроекты внутри каждого NPD-проекта (см. NpdBoard.handleCreateProject).
 * Они служебные (swimlane-носители), а не самостоятельные проекты, поэтому
 * их НЕ нужно показывать в попапах выбора проекта.
 */
export const NPD_STREAM_NAMES = [
  "Продакт",
  "Реклама",
  "RnD",
  "СКК",
  "Производство",
  "Закупки",
  "Продажи",
  "Покупка оборудования",
] as const;

const STREAM_SET = new Set<string>(NPD_STREAM_NAMES as readonly string[]);

/**
 * Признак "служебного" NPD-стрим-подпроекта: NPD-тип, есть parent_id и имя
 * совпадает с одним из 8 канонических стримов.
 */
export function isNpdStreamSubproject(g: {
  project_type?: string | null;
  parent_id?: string | null;
  name?: string | null;
}): boolean {
  return (
    g.project_type === "npd" &&
    !!g.parent_id &&
    !!g.name &&
    STREAM_SET.has(g.name)
  );
}

export type ProjectFilterOptions = {
  /** Скрыть протоколы (project_type='protocol'). По умолчанию true. */
  excludeProtocols?: boolean;
  /** Скрыть закрытые/архивные. По умолчанию true. */
  excludeClosed?: boolean;
  /** Скрыть служебные NPD-стрим-подпроекты. По умолчанию true. */
  excludeNpdStreamSubprojects?: boolean;
  /** Доп. фильтр (после стандартных правил). */
  extra?: (g: any) => boolean;
};

/**
 * Универсальный фильтр для попапов «Выбрать проект».
 * Скрывает протоколы, архив и служебные NPD-стрим-подпроекты.
 */
export function filterRealProjects<T extends { project_type?: string | null; parent_id?: string | null; closed_at?: string | null; name?: string | null }>(
  groups: T[] | null | undefined,
  options: ProjectFilterOptions = {},
): T[] {
  const {
    excludeProtocols = true,
    excludeClosed = true,
    excludeNpdStreamSubprojects = true,
    extra,
  } = options;
  return (groups || []).filter((g) => {
    if (excludeProtocols && g.project_type === "protocol") return false;
    if (excludeClosed && g.closed_at) return false;
    if (excludeNpdStreamSubprojects && isNpdStreamSubproject(g)) return false;
    if (extra && !extra(g)) return false;
    return true;
  });
}