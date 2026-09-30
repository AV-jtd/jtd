/**
 * Цикл вызовов ассистента внутри приложения (шаг 2 плана ИИ, 30.09.2026).
 *
 * Модель получает переписку и каталог инструментов, вызывает инструменты,
 * видит результаты и решает, что делать дальше, — пока не ответит текстом.
 * Так в Cowork работает сам Claude через коннектор; здесь цикл наш.
 *
 * Правило записи. Инструменты «только чтение» выполняются сразу. Всё, что
 * меняет данные, НЕ выполняется молча: цикл останавливается и возвращает
 * «ждёт подтверждения» со списком действий; окно показывает карточку, и после
 * решения человека цикл продолжается с того же места (`decision`). В Cowork эту
 * роль играет подтверждение вызова самим клиентом; внутри приложения его нет,
 * поэтому оно здесь.
 *
 * Сервер состояния не хранит: переписка с вызовами инструментов приходит от
 * окна и уходит обратно. Подделать её может только сам пользователь, а
 * инструменты всё равно исполняются его токеном и его правами.
 *
 * Модель и инструменты подаются снаружи (`AgentDeps`) — цикл проверяется
 * тестами без сети и без базы (src/test/assistantAgent.test.ts).
 */

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type CatalogEntry = { name: string; title: string | null; read_only: boolean; destructive: boolean };

export type ToolResult = { ok: true; text: string; structured?: unknown } | { ok: false; error: string };

export interface AgentDeps {
  /** Один ход модели: вернуть её сообщение (текст и/или вызовы инструментов). */
  callModel: (messages: ChatMessage[]) => Promise<{ content: string | null; tool_calls?: ToolCall[] }>;
  runTool: (name: string, input: unknown) => Promise<ToolResult>;
  catalog: CatalogEntry[];
}

export type PendingAction = {
  id: string;
  name: string;
  title: string;
  input: Record<string, unknown>;
  destructive: boolean;
};

export type AgentStep = { name: string; title: string; ok: boolean };

export type AgentResult =
  | { status: "done"; reply: string; messages: ChatMessage[]; steps: AgentStep[] }
  | { status: "confirm"; reply: string; messages: ChatMessage[]; steps: AgentStep[]; pending: PendingAction[] };

/** Предел ходов модели на один запрос — чтобы зацикливание не стоило денег. */
export const MAX_STEPS = 8;
/** Предел длины результата инструмента, который уходит модели. */
export const MAX_RESULT_CHARS = 15000;

const REJECTED = "Пользователь отклонил это действие. Не повторяй его без новой просьбы.";

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Результат инструмента — в строку для модели: текст плюс данные, с обрезкой. */
export function toolResultForModel(r: ToolResult): string {
  if (r.ok === false) return `ОШИБКА: ${(r as { error: string }).error}`;
  let out = r.text;
  if (r.structured !== undefined) out += `\n\nДанные:\n${JSON.stringify(r.structured)}`;
  if (out.length > MAX_RESULT_CHARS) {
    out = out.slice(0, MAX_RESULT_CHARS) + `\n… [обрезано: ${out.length - MAX_RESULT_CHARS} символов. Сузь запрос — фильтр, limit, offset]`;
  }
  return out;
}

/** Вызовы из последнего хода ассистента, на которые ещё нет ответа инструмента. */
function unanswered(messages: ChatMessage[]): ToolCall[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      const answered = new Set(
        messages.slice(i + 1).filter((x): x is Extract<ChatMessage, { role: "tool" }> => x.role === "tool").map((x) => x.tool_call_id),
      );
      return (m.tool_calls ?? []).filter((c) => !answered.has(c.id));
    }
  }
  return [];
}

export async function runAgent(opts: {
  messages: ChatMessage[];
  deps: AgentDeps;
  /** Решение по действиям, ждавшим подтверждения. */
  decision?: { approve: boolean };
  maxSteps?: number;
}): Promise<AgentResult> {
  const { deps } = opts;
  const messages = [...opts.messages];
  const steps: AgentStep[] = [];
  const meta = new Map(deps.catalog.map((t) => [t.name, t]));
  const titleOf = (name: string) => meta.get(name)?.title ?? name;

  const execute = async (call: ToolCall) => {
    const r = await deps.runTool(call.function.name, parseArgs(call.function.arguments));
    steps.push({ name: call.function.name, title: titleOf(call.function.name), ok: r.ok });
    messages.push({ role: "tool", tool_call_id: call.id, content: toolResultForModel(r) });
  };

  // Продолжение после карточки: исполнить или отклонить то, что ждало.
  if (opts.decision) {
    for (const call of unanswered(messages)) {
      if (opts.decision.approve) await execute(call);
      else messages.push({ role: "tool", tool_call_id: call.id, content: REJECTED });
    }
  } else if (unanswered(messages).length > 0) {
    // Новое сообщение, а прошлые действия так и остались без решения —
    // считаем их отклонёнными, иначе модель получит незакрытые вызовы.
    for (const call of unanswered(messages)) messages.push({ role: "tool", tool_call_id: call.id, content: REJECTED });
  }

  const max = opts.maxSteps ?? MAX_STEPS;
  let lastText = "";
  for (let step = 0; step < max; step++) {
    const turn = await deps.callModel(messages);
    const calls = turn.tool_calls ?? [];
    messages.push({ role: "assistant", content: turn.content ?? null, ...(calls.length ? { tool_calls: calls } : {}) });
    if (turn.content) lastText = turn.content;
    if (calls.length === 0) return { status: "done", reply: turn.content ?? "", messages, steps };

    const pending: PendingAction[] = [];
    for (const call of calls) {
      const t = meta.get(call.function.name);
      // Неизвестный инструмент исполняем как чтение: runTool вернёт понятный
      // отказ, и модель поправится сама.
      if (!t || t.read_only) await execute(call);
      else pending.push({ id: call.id, name: call.function.name, title: titleOf(call.function.name), input: parseArgs(call.function.arguments), destructive: t.destructive });
    }
    if (pending.length > 0) {
      return { status: "confirm", reply: turn.content ?? "", messages, steps, pending };
    }
  }
  return {
    status: "done",
    reply: (lastText ? lastText + "\n\n" : "") + `_Остановился после ${max} шагов. Уточните запрос или попросите продолжить._`,
    messages,
    steps,
  };
}
