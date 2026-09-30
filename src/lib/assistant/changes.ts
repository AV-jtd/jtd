/**
 * «Было → станет» в карточке подтверждения (01.10.2026).
 *
 * Список аргументов («срок: 05.10.2026, 18:00») не отвечает на главный вопрос
 * человека перед кнопкой «Выполнить»: что поменяется. Для переноса нужен
 * старый срок рядом с новым, для назначения — кто был и кто станет. Текущие
 * значения сервер читает токеном пользователя (edge.ts), а сравнение — здесь,
 * чистой функцией: её проверяют тесты без базы (src/test/assistantChanges.test.ts).
 *
 * Поля, попавшие в таблицу, перечислены в `keys` — окно и бот не повторяют их
 * в списке аргументов.
 */

export type Change = { field: string; from: string; to: string };

export type TaskSnapshot = {
  title: string;
  deadline: string | null;
  start_at: string | null;
  assigned_to: string | null;
  is_important: boolean | null;
  priority: number | null;
  is_completed: boolean;
  /** Статус-тег («в работе», «отправлено»…); null — без статуса, undefined — прочитать не вышло. */
  status?: string | null;
};

export type MilestoneSnapshot = {
  name: string;
  planned_date: string | null;
  actual_date: string | null;
  status: string | null;
};

export type ShiftPreview = { from: string | null; to: string; count: number; drift: boolean };

export type ChangeInput = {
  task?: TaskSnapshot;
  milestone?: MilestoneSnapshot;
  personName: (id: string | null) => string | undefined;
  /** Имя нового исполнителя, если его удалось найти по тому, что передала модель. */
  newAssigneeName?: string;
  shift?: ShiftPreview;
};

export type ChangeSet = { changes: Change[]; keys: string[]; note?: string };

const PRIORITY: Record<number, string> = { 1: "P1 — критический", 2: "P2 — высокий", 3: "P3 — средний", 4: "P4 — низкий" };
const MILESTONE_STATUS: Record<string, string> = {
  pending: "ожидается", in_progress: "в работе", go: "go", no_go: "no-go",
  conditional: "условно", completed: "достигнута", missed: "пропущена",
};

/** «05.10.2026, 18:00» по Москве; время опускаем, если это полночь. */
export function mskDate(v: string | null | undefined, empty = "—"): string {
  if (!v) return empty;
  // Дата без времени — календарный день, часовой пояс к нему не применяем.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (day) return `${day[3]}.${day[2]}.${day[1]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const date = d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  return time === "00:00" ? date : `${date}, ${time}`;
}

const yesNo = (v: boolean | null | undefined) => (v ? "да" : "нет");

export function computeChanges(action: { name: string; input: Record<string, unknown> }, s: ChangeInput): ChangeSet {
  const out: Change[] = [];
  const keys: string[] = [];
  const push = (key: string, field: string, from: string, to: string) => {
    // Совпадение тоже показываем: «срок: 05.10 → 05.10» честнее, чем пропавшая строка.
    keys.push(key);
    out.push({ field, from, to });
  };
  const inp = action.input;
  const t = s.task;

  switch (action.name) {
    case "update_task": {
      if (!t) break;
      if (inp.status !== undefined) {
        push("status", "статус", t.status === undefined ? "—" : t.status ?? "без статуса", inp.status === "none" ? "без статуса" : String(inp.status));
      }
      if (inp.assignee !== undefined) {
        push("assignee", "исполнитель", s.personName(t.assigned_to) ?? "—", s.newAssigneeName ?? String(inp.assignee));
      }
      if (inp.deadline !== undefined) {
        push("deadline", "срок", mskDate(t.deadline, "без срока"), mskDate(inp.deadline as string | null, "без срока"));
      }
      if (inp.start_at !== undefined) {
        push("start_at", "начало", mskDate(t.start_at), mskDate(inp.start_at as string | null));
      }
      if (inp.is_important !== undefined) push("is_important", "важная", yesNo(t.is_important), yesNo(inp.is_important as boolean));
      if (inp.priority !== undefined) {
        push("priority", "приоритет", t.priority ? PRIORITY[t.priority] : "—", inp.priority ? PRIORITY[inp.priority as number] : "—");
      }
      break;
    }
    case "update_task_deadline": {
      if (!t) break;
      push("deadline", "срок", mskDate(t.deadline, "без срока"), mskDate(inp.deadline as string));
      break;
    }
    case "complete_task": {
      if (!t) break;
      out.push({ field: "задача", from: t.is_completed ? "закрыта" : "открыта", to: "закрыта" });
      break;
    }
    case "move_task": {
      if (!s.shift) break;
      keys.push("new_deadline", "shift_days");
      out.push({ field: "срок", from: mskDate(s.shift.from, "без срока"), to: mskDate(s.shift.to) });
      const notes: string[] = [];
      if (s.shift.count > 0) notes.push(`Вместе с ней сдвинется ещё ${s.shift.count} ${plural(s.shift.count, "связанная задача", "связанные задачи", "связанных задач")}.`);
      if (s.shift.drift) notes.push("План проекта зафиксирован: перенос запишется как отклонение.");
      return { changes: out, keys, note: notes.join(" ") || undefined };
    }
    case "update_milestone": {
      const m = s.milestone;
      if (!m) break;
      if (inp.name !== undefined) push("name", "название", m.name, String(inp.name));
      if (inp.planned_date !== undefined) push("planned_date", "плановая дата", mskDate(m.planned_date), mskDate(inp.planned_date as string));
      if (inp.actual_date !== undefined) push("actual_date", "факт", mskDate(m.actual_date), mskDate(inp.actual_date as string | null));
      if (inp.status !== undefined) {
        push("status", "статус", MILESTONE_STATUS[m.status ?? ""] ?? m.status ?? "—", MILESTONE_STATUS[String(inp.status)] ?? String(inp.status));
      }
      break;
    }
  }
  return { changes: out, keys };
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
