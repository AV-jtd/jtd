import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Критический путь и запас по срокам.
 *
 * Зачем считать, а не смотреть глазами. На вопрос «что тут главная цепочка и
 * где люфт» Гант отвечает картинкой, а в разговоре и в письме нужны числа:
 * какая задача держит дату проекта и у какой есть неделя в запасе. Без этого
 * перенос обсуждается наугад — двигают то, что заметнее, а не то, что держит.
 *
 * Считается по датам, календарными днями (решение владельца от 30.09): тот же
 * счёт, что у каскада. Длительность нигде не хранится, она равна разнице
 * начала и срока — тоже решение владельца.
 *
 * ЧЕГО ЗДЕСЬ НЕТ, НАМЕРЕННО. Учитываются только связи «финиш → старт» (FS).
 * SS, FF и SF пропускаются и возвращаются числом `ignored_links`: посчитать их
 * приблизительно и не сказать об этом — ровно тот способ, которым в этом
 * проекте уже расходились дрифт и счётчики. Пусть лучше ответ будет неполным
 * явно, чем полным на вид.
 */

export type CpmNode = {
  id: string;
  /** Срок (у вехи — плановая дата). Узлы без срока в расчёт не берутся. */
  end: string | null;
  /** Начало; нет — считаем задачу точкой нулевой длительности. */
  start?: string | null;
};

export type CpmLink = { from: string; to: string; type: string; lag_days: number };

export type CpmNodeResult = {
  id: string;
  /** Запас в календарных днях: сколько можно сдвинуть, не сдвинув дату проекта. */
  float_days: number;
  /** Нет запаса — держит дату проекта. */
  critical: boolean;
  /** Поздний срок: позже этой даты задача тянет за собой весь проект. */
  late_finish: string;
};

export type CpmResult = {
  nodes: CpmNodeResult[];
  /** Цепочка без запаса, от начала к концу. Пусто, если считать не по чему. */
  critical_path: string[];
  /** Самая поздняя дата среди узлов графа — дата, к которой всё считается. */
  project_end: string | null;
  /** Сколько связей пропущено как не-FS. */
  ignored_links: number;
  /** Граф оказался с кольцом — расчёт неполный, названы участники. */
  cycle: string[] | null;
};

const DAY = 86400000;

export function computeCriticalPath(nodesIn: CpmNode[], linksIn: CpmLink[]): CpmResult {
  const nodes = new Map<string, { id: string; start: number | null; end: number }>();
  for (const n of nodesIn) {
    if (!n.end) continue; // без срока места на шкале нет
    const end = parseISO(n.end).getTime();
    if (Number.isNaN(end)) continue;
    const startRaw = n.start ? parseISO(n.start).getTime() : NaN;
    nodes.set(n.id, { id: n.id, start: Number.isNaN(startRaw) ? null : startRaw, end });
  }

  const links = linksIn.filter((l) => nodes.has(l.from) && nodes.has(l.to));
  const fs = links.filter((l) => l.type === "FS");
  const ignoredLinks = links.length - fs.length;

  if (nodes.size === 0) {
    return { nodes: [], critical_path: [], project_end: null, ignored_links: ignoredLinks, cycle: null };
  }

  const successors = new Map<string, CpmLink[]>();
  for (const l of fs) {
    if (!successors.has(l.from)) successors.set(l.from, []);
    successors.get(l.from)!.push(l);
  }

  const projectEnd = Math.max(...[...nodes.values()].map((n) => n.end));

  // Обратный проход. Поздний финиш узла — самый ранний из поздних стартов его
  // преемников минус лаг; у узла без преемников это дата проекта.
  const lateFinish = new Map<string, number>();
  const state = new Map<string, "visiting" | "done">();
  let cycle: string[] | null = null;

  const visit = (id: string, stack: string[]): number => {
    const known = lateFinish.get(id);
    if (known !== undefined && state.get(id) === "done") return known;
    if (state.get(id) === "visiting") {
      // Кольцо. link_tasks такое не создаёт, но в исторических данных встретиться
      // может, и молча вернуть число здесь нельзя.
      if (!cycle) cycle = [...stack.slice(stack.indexOf(id)), id];
      return projectEnd;
    }
    state.set(id, "visiting");
    const succ = successors.get(id) ?? [];
    let lf = projectEnd;
    for (const l of succ) {
      const s = nodes.get(l.to)!;
      const sLateFinish = visit(l.to, [...stack, id]);
      const sDuration = s.start !== null ? Math.max(0, Math.round((s.end - s.start) / DAY)) : 0;
      const sLateStart = sLateFinish - sDuration * DAY;
      lf = Math.min(lf, sLateStart - (l.lag_days || 0) * DAY);
    }
    // Длительность самого узла в поздний финиш не входит: финиш про то, когда
    // узел обязан закончиться, а не когда начаться.
    lateFinish.set(id, lf);
    state.set(id, "done");
    return lf;
  };

  for (const id of nodes.keys()) visit(id, []);

  const results: CpmNodeResult[] = [];
  for (const [id, n] of nodes) {
    const lf = lateFinish.get(id)!;
    const floatDays = differenceInCalendarDays(new Date(lf), new Date(n.end));
    results.push({ id, float_days: floatDays, critical: floatDays <= 0, late_finish: new Date(lf).toISOString() });
  }

  return {
    nodes: results,
    critical_path: longestCriticalChain(nodes, successors, results),
    project_end: new Date(projectEnd).toISOString(),
    ignored_links: ignoredLinks,
    cycle,
  };
}

/**
 * Критический путь — самая длинная цепочка узлов без запаса. Узлов без запаса
 * может быть много и вне одной цепочки (у каждого одинокого узла с самой
 * поздней датой запас нулевой), поэтому путь — это именно цепочка по связям.
 */
function longestCriticalChain(
  nodes: Map<string, { id: string; start: number | null; end: number }>,
  successors: Map<string, CpmLink[]>,
  results: CpmNodeResult[],
): string[] {
  const critical = new Set(results.filter((r) => r.critical).map((r) => r.id));
  if (critical.size === 0) return [];

  const memo = new Map<string, string[]>();
  const walking = new Set<string>();

  const chainFrom = (id: string): string[] => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (walking.has(id)) return [id]; // кольцо: дальше не идём
    walking.add(id);
    let best: string[] = [];
    for (const l of successors.get(id) ?? []) {
      if (!critical.has(l.to)) continue;
      const tail = chainFrom(l.to);
      if (tail.length > best.length) best = tail;
    }
    walking.delete(id);
    const chain = [id, ...best];
    memo.set(id, chain);
    return chain;
  };

  let longest: string[] = [];
  for (const id of critical) {
    const chain = chainFrom(id);
    if (chain.length > longest.length) longest = chain;
  }
  // Одинокий узел цепочкой не считается: «критический путь из одной задачи»
  // ничего не сообщает, а выглядит как ответ.
  return longest.length > 1 ? longest : [];
}
