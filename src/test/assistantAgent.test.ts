import { describe, it, expect } from "vitest";
import {
  runAgent,
  toolResultForModel,
  MAX_RESULT_CHARS,
  type AgentDeps,
  type ChatMessage,
  type ToolCall,
} from "@/lib/assistant/agent";

const catalog = [
  { name: "list_tasks", title: "Список задач", read_only: true, destructive: false },
  { name: "get_task", title: "Задача", read_only: true, destructive: false },
  { name: "update_task", title: "Изменить задачу", read_only: false, destructive: false },
  { name: "delete_item", title: "Удалить", read_only: false, destructive: true },
];

let n = 0;
const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `c${++n}`,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});

/** Модель по сценарию: каждый ход — заранее заданный ответ. */
function scripted(turns: Array<{ content?: string; tool_calls?: ToolCall[] }>) {
  const seen: ChatMessage[][] = [];
  const ran: string[] = [];
  const deps: AgentDeps = {
    catalog,
    callModel: async (messages) => {
      seen.push(structuredClone(messages));
      const t = turns.shift();
      if (!t) throw new Error("модель вызвана больше, чем ожидалось");
      return { content: t.content ?? null, tool_calls: t.tool_calls };
    },
    runTool: async (name, input) => {
      ran.push(`${name}:${JSON.stringify(input)}`);
      return name === "get_task" ? { ok: false, error: "Задача не найдена" } : { ok: true, text: `готово ${name}`, structured: { n: 1 } };
    },
  };
  return { deps, seen, ran };
}

const user = (content: string): ChatMessage => ({ role: "user", content });

describe("runAgent — чтение", () => {
  it("инструменты чтения исполняются сразу, цикл идёт до текстового ответа", async () => {
    const { deps, ran, seen } = scripted([
      { tool_calls: [call("list_tasks", { filter: "overdue" })] },
      { content: "У вас 3 просроченные задачи." },
    ]);
    const r = await runAgent({ messages: [user("что просрочено?")], deps });
    expect(r.status).toBe("done");
    expect(r.reply).toBe("У вас 3 просроченные задачи.");
    expect(ran).toEqual(['list_tasks:{"filter":"overdue"}']);
    expect(r.steps).toEqual([{ name: "list_tasks", title: "Список задач", ok: true }]);
    // Второй ход модель видит результат инструмента.
    const last = seen[1][seen[1].length - 1];
    expect(last.role).toBe("tool");
    expect((last as { content: string }).content).toContain("готово list_tasks");
  });

  it("ошибка инструмента уходит модели как текст, цикл не падает", async () => {
    const { deps, seen } = scripted([{ tool_calls: [call("get_task", { task_id: "x" })] }, { content: "Не нашёл." }]);
    const r = await runAgent({ messages: [user("открой задачу")], deps });
    expect(r.status).toBe("done");
    expect(r.steps[0].ok).toBe(false);
    expect(JSON.stringify(seen[1])).toContain("ОШИБКА: Задача не найдена");
  });
});

describe("runAgent — запись ждёт подтверждения", () => {
  it("запись не исполняется, а возвращается карточкой", async () => {
    const { deps, ran } = scripted([
      { content: "Перенесу срок.", tool_calls: [call("update_task", { task_id: "t1", deadline: "2026-10-10" })] },
    ]);
    const r = await runAgent({ messages: [user("перенеси на 10.10")], deps });
    expect(r.status).toBe("confirm");
    expect(ran).toEqual([]);
    if (r.status !== "confirm") return;
    expect(r.reply).toBe("Перенесу срок.");
    expect(r.pending).toEqual([
      { id: expect.any(String), name: "update_task", title: "Изменить задачу", input: { task_id: "t1", deadline: "2026-10-10" }, destructive: false },
    ]);
  });

  it("после «Выполнить» действие исполняется и цикл продолжается", async () => {
    const first = scripted([{ tool_calls: [call("update_task", { task_id: "t1" })] }]);
    const r1 = await runAgent({ messages: [user("измени")], deps: first.deps });
    const second = scripted([{ content: "Готово, срок перенесён." }]);
    const r2 = await runAgent({ messages: r1.messages, deps: second.deps, decision: { approve: true } });
    expect(second.ran).toEqual(['update_task:{"task_id":"t1"}']);
    expect(r2.status).toBe("done");
    expect(r2.reply).toBe("Готово, срок перенесён.");
  });

  it("после «Отмена» действие не исполняется, а модель узнаёт об отказе", async () => {
    const first = scripted([{ tool_calls: [call("delete_item", { id: "t1" })] }]);
    const r1 = await runAgent({ messages: [user("удали")], deps: first.deps });
    if (r1.status === "confirm") expect(r1.pending[0].destructive).toBe(true);
    const second = scripted([{ content: "Хорошо, не удаляю." }]);
    await runAgent({ messages: r1.messages, deps: second.deps, decision: { approve: false } });
    expect(second.ran).toEqual([]);
    expect(JSON.stringify(second.seen[0])).toContain("Пользователь отклонил");
  });

  it("в одном ходе чтение исполняется сразу, запись ждёт", async () => {
    const { deps, ran } = scripted([{ tool_calls: [call("list_tasks"), call("update_task", { task_id: "t2" })] }]);
    const r = await runAgent({ messages: [user("проверь и поправь")], deps });
    expect(ran).toEqual(["list_tasks:{}"]);
    expect(r.status).toBe("confirm");
  });

  it("новое сообщение при неотвеченной карточке — прошлые действия считаются отклонёнными", async () => {
    const first = scripted([{ tool_calls: [call("update_task", { task_id: "t3" })] }]);
    const r1 = await runAgent({ messages: [user("измени")], deps: first.deps });
    const second = scripted([{ content: "Понял, другое." }]);
    await runAgent({ messages: [...r1.messages, user("нет, лучше покажи задачи")], deps: second.deps });
    expect(second.ran).toEqual([]);
    const sent = second.seen[0];
    // Модель получает закрытый вызов, иначе провайдер отверг бы запрос.
    expect(sent.some((m) => m.role === "tool" && m.content.includes("отклонил"))).toBe(true);
  });
});

describe("runAgent — предохранители", () => {
  it("останавливается после заданного числа ходов", async () => {
    const turns = Array.from({ length: 3 }, () => ({ tool_calls: [call("list_tasks")] }));
    const { deps } = scripted(turns);
    const r = await runAgent({ messages: [user("ищи")], deps, maxSteps: 3 });
    expect(r.status).toBe("done");
    expect(r.reply).toContain("Остановился после 3 шагов");
  });

  it("длинный результат обрезается с подсказкой сузить запрос", () => {
    const s = toolResultForModel({ ok: true, text: "x".repeat(MAX_RESULT_CHARS + 500) });
    expect(s.length).toBeLessThan(MAX_RESULT_CHARS + 200);
    expect(s).toContain("обрезано");
  });

  it("неразборчивые аргументы от модели не роняют цикл", async () => {
    const bad: ToolCall = { id: "b1", type: "function", function: { name: "list_tasks", arguments: "{не json" } };
    const { deps, ran } = scripted([{ tool_calls: [bad] }, { content: "ок" }]);
    const r = await runAgent({ messages: [user("?")], deps });
    expect(r.status).toBe("done");
    expect(ran).toEqual(["list_tasks:{}"]);
  });
});

describe("runAgent — пошаговый режим", () => {
  it("после хода с чтением возвращает working, следующий вызов продолжает", async () => {
    const a = scripted([{ content: "Смотрю.", tool_calls: [call("list_tasks")] }]);
    const r1 = await runAgent({ messages: [user("что горит?")], deps: a.deps, stepwise: true });
    expect(r1.status).toBe("working");
    expect(r1.steps.map((s) => s.name)).toEqual(["list_tasks"]);
    const b = scripted([{ content: "Горит одна задача." }]);
    const r2 = await runAgent({ messages: r1.messages, deps: b.deps, stepwise: true });
    expect(r2.status).toBe("done");
    expect(r2.reply).toBe("Горит одна задача.");
  });

  it("предел ходов считается по переписке — повторные вызовы его не обходят", async () => {
    let msgs: ChatMessage[] = [user("ищи")];
    let last;
    for (let i = 0; i < 30; i++) {
      const { deps } = scripted([{ tool_calls: [call("list_tasks")] }]);
      last = await runAgent({ messages: msgs, deps, stepwise: true });
      msgs = last.messages;
      if (last.status === "done") break;
    }
    expect(last!.status).toBe("done");
    expect(last!.reply).toContain("Остановился");
    expect(msgs.filter((m) => m.role === "assistant").length).toBe(16);
  });
});
