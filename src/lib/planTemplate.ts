import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { resolveAllViolations, type GraphEntity } from "./dependencyGraph";

/**
 * План по образцу другого проекта.
 *
 * Сценарий владельца: «сделай план покупки оборудования по примеру проекта
 * такого-то, только приёмка в апреле». Значит нужно три вещи: снять со проекта-
 * образца форму (что за чем и с какими промежутками), разложить её от новой
 * даты и поправить отдельные сроки прямо из сообщения.
 *
 * Форма снимается в СМЕЩЕНИЯХ от самой ранней даты образца, а не в абсолютных
 * датах. Иначе «по примеру» означало бы «теми же числами прошлого года».
 *
 * Дни календарные — как у каскада и критического пути (решение владельца
 * 30.09). Масштаб (`scale`) позволяет сжать или растянуть весь план: закупка,
 * которую в прошлый раз тянули полгода, может повторяться за три месяца.
 *
 * Правки из сообщения применяются ЗДЕСЬ ЖЕ, и здесь же доигрывается каскад по
 * связям. Причина: то, что показали человеку, и то, что запишется, должно быть
 * одним и тем же расчётом. Посчитать предпросмотр одним способом, а запись
 * другим — ровно тот способ разойтись, которым у нас разъехались дрифт и
 * счётчики дашборда с PMO.
 */

export type TemplateItem = {
  id: string;
  kind: "task" | "milestone";
  title: string;
  /** Начало; у вехи его нет. */
  start: string | null;
  /** Срок; у вехи — плановая дата. Элементы без него форму не задают. */
  end: string | null;
};

export type TemplateLink = { from: string; to: string; type: string; lag_days: number };

/** Правка из сообщения: «приёмку поставь на 20 апреля», «монтаж на неделю позже». */
export type PlanOverride = {
  /** Название элемента образца. Сопоставляется без учёта регистра и пробелов. */
  match: string;
  /** Новая дата (для задачи — срок, для вехи — плановая дата). */
  new_date?: string;
  /** Либо сдвиг в календарных днях от разложенной даты. */
  shift_days?: number;
  /** Не переносить этот элемент в новый план. */
  skip?: boolean;
  /** Другое название в новом плане. */
  title?: string;
};

export type LaidOutItem = {
  source_id: string;
  kind: "task" | "milestone";
  title: string;
  start: string | null;
  end: string;
  /** Смещения от начала плана, в календарных днях. */
  offset_start_days: number | null;
  offset_end_days: number;
  /** Дату задал человек правкой из сообщения. */
  overridden: boolean;
  /** Дату поправил каскад по связям после правок. */
  moved_by_links: boolean;
};

export type LayoutResult = {
  /** Самая ранняя дата образца — точка, от которой считались смещения. */
  template_anchor: string | null;
  items: LaidOutItem[];
  links: TemplateLink[];
  /** Элементы образца, не попавшие в план, и почему. */
  skipped: Array<{ title: string; reason: string }>;
  /** Мешает записи: несопоставленная правка, двусмысленное название и прочее. */
  problems: string[];
};

const DAY = 86400000;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function layoutPlan(args: {
  items: TemplateItem[];
  links: TemplateLink[];
  /** Дата, с которой начинается новый план. */
  startDate: string;
  scale?: number;
  overrides?: PlanOverride[];
}): LayoutResult {
  const problems: string[] = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const scale = args.scale ?? 1;
  if (!(scale > 0) || scale > 10) problems.push(`Масштаб ${scale} за пределами разумного (0 < scale ≤ 10)`);

  const start = parseISO(args.startDate);
  if (Number.isNaN(start.getTime())) {
    return { template_anchor: null, items: [], links: [], skipped, problems: [`Не разобрал дату начала «${args.startDate}»`] };
  }

  // Форму задают только элементы с датой: остальным негде встать на шкале.
  const dated = args.items.filter((i) => {
    if (i.end) return true;
    skipped.push({ title: i.title, reason: "в образце нет срока — в план не переносится" });
    return false;
  });
  if (dated.length === 0) {
    return { template_anchor: null, items: [], links: [], skipped, problems: ["В образце нет ни одного элемента со сроком"] };
  }

  const times = dated.flatMap((i) => [i.start, i.end].filter(Boolean).map((d) => parseISO(d!).getTime()));
  const anchor = Math.min(...times);

  // ── Правки: сначала сопоставление, потом применение ───────────────────
  const overrides = args.overrides ?? [];
  const matched = new Map<string, PlanOverride>();
  for (const o of overrides) {
    const hits = dated.filter((i) => norm(i.title) === norm(o.match));
    const loose = hits.length ? hits : dated.filter((i) => norm(i.title).includes(norm(o.match)));
    if (loose.length === 0) {
      problems.push(`Правка «${o.match}»: в образце нет такого элемента`);
      continue;
    }
    // Двусмысленность отклоняем с перечнем: угадать — значит переставить не тот
    // срок и промолчать.
    if (loose.length > 1) {
      problems.push(`Правка «${o.match}» подходит к ${loose.length}: ${loose.map((i) => `«${i.title}»`).join(", ")}. Уточните название.`);
      continue;
    }
    const target = loose[0];
    if (matched.has(target.id)) {
      problems.push(`На «${target.title}» приходится больше одной правки`);
      continue;
    }
    if (o.new_date !== undefined && o.shift_days !== undefined) {
      problems.push(`Правка «${o.match}»: нужно одно из двух — new_date или shift_days`);
      continue;
    }
    if (o.new_date !== undefined) {
      const d = parseISO(o.new_date);
      if (Number.isNaN(d.getTime())) {
        problems.push(`Правка «${o.match}»: не разобрал дату «${o.new_date}»`);
        continue;
      }
      const y = d.getUTCFullYear();
      if (y < 2000 || y > 2100) {
        problems.push(`Правка «${o.match}»: дата ${o.new_date} вне разумного диапазона (2000–2100)`);
        continue;
      }
    }
    matched.set(target.id, o);
  }

  // ── Раскладка ─────────────────────────────────────────────────────────
  const laid = new Map<string, LaidOutItem>();
  for (const it of dated) {
    const o = matched.get(it.id);
    if (o?.skip) {
      skipped.push({ title: it.title, reason: "исключён правкой из сообщения" });
      continue;
    }
    const endOffset = Math.round((parseISO(it.end!).getTime() - anchor) / DAY * scale);
    const startOffset = it.start ? Math.round((parseISO(it.start).getTime() - anchor) / DAY * scale) : null;

    let end = addDays(start, endOffset);
    let overridden = false;
    if (o?.new_date !== undefined) {
      end = parseISO(o.new_date);
      overridden = true;
    } else if (o?.shift_days !== undefined) {
      end = addDays(end, o.shift_days);
      overridden = true;
    }
    // Длительность сохраняется: её нигде не храним, она и есть разница начала
    // и срока (решение владельца).
    const duration = startOffset === null ? null : endOffset - startOffset;
    const startDate = duration === null ? null : addDays(end, -duration);

    laid.set(it.id, {
      source_id: it.id,
      kind: it.kind,
      title: o?.title ?? it.title,
      start: startDate ? startDate.toISOString() : null,
      end: end.toISOString(),
      offset_start_days: startOffset,
      offset_end_days: endOffset,
      overridden,
      moved_by_links: false,
    });
  }

  // Связи только между тем, что осталось: висящий конец ни показать, ни
  // посчитать по нему каскад.
  const links = args.links.filter((l) => laid.has(l.from) && laid.has(l.to));
  const droppedLinks = args.links.length - links.length;
  if (droppedLinks > 0) {
    skipped.push({ title: `связей: ${droppedLinks}`, reason: "один из концов не попал в план" });
  }

  // ── Каскад после правок ───────────────────────────────────────────────
  // Правка «приёмку на 20 апреля» двигает всё, что стоит за приёмкой. Считаем
  // это здесь же, тем же кодом, что в приложении.
  const entities = new Map<string, GraphEntity>();
  laid.forEach((i, id) => entities.set(id, { id, start_at: i.start, deadline: i.end }));
  const fixes = resolveAllViolations(
    links.map((l, n) => ({
      id: String(n),
      predecessor_id: l.from,
      successor_id: l.to,
      dependency_type: l.type,
      lag_days: l.lag_days,
      created_by: "",
      created_at: "",
      predecessor_entity_type: "task",
      successor_entity_type: "task",
    })),
    entities,
  );
  for (const [id, fix] of fixes) {
    const item = laid.get(id);
    if (!item) continue;
    if (fix.deadline) item.end = fix.deadline;
    // У вехи начала нет, и придумывать его каскадом нельзя.
    if (fix.start_at && item.kind === "task") item.start = fix.start_at;
    item.moved_by_links = true;
  }

  const items = [...laid.values()].sort((a, b) => a.end.localeCompare(b.end));
  for (const i of items) {
    const y = new Date(i.end).getUTCFullYear();
    if (y < 2000 || y > 2100) problems.push(`«${i.title}»: расчётная дата ${i.end} вне разумного диапазона`);
    if (i.start && new Date(i.start) > new Date(i.end)) {
      problems.push(`«${i.title}»: после правок начало оказалось позже срока`);
    }
  }

  return {
    template_anchor: new Date(anchor).toISOString(),
    items,
    links,
    skipped,
    problems,
  };
}

/** Длина плана в календарных днях — для ответа человеку «займёт столько-то». */
export function planSpanDays(items: LaidOutItem[]): number {
  if (items.length === 0) return 0;
  const times = items.flatMap((i) => [i.start, i.end].filter(Boolean).map((d) => parseISO(d!).getTime()));
  return differenceInCalendarDays(new Date(Math.max(...times)), new Date(Math.min(...times)));
}
