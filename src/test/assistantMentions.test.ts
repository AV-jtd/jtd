import { describe, it, expect } from "vitest";
import { mentionedTasks } from "@/lib/assistant/mentions";
import type { ChatMessage } from "@/lib/assistant/agent";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const tool = (data: unknown, asText = false): ChatMessage => ({
  role: "tool",
  tool_call_id: "c1",
  content: asText ? JSON.stringify(data) : `Найдено 3\n\nДанные:\n${JSON.stringify(data)}`,
});

describe("задачи, упомянутые в ответе", () => {
  const msgs: ChatMessage[] = [
    { role: "user", content: "что горит?" },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "list_tasks", arguments: "{}" } }] },
    tool({ tasks: [
      { id: A, title: "КП для Ашана до 10.10", is_completed: false },
      { id: B, title: "Образцы в Ленту", is_completed: false },
      { id: C, title: "Старая закрытая задача", is_completed: true },
    ] }),
  ];

  it("берёт только названные в ответе", () => {
    const r = mentionedTasks(msgs, "Горит одна задача: **«КП для Ашана до 10.10»** — срок завтра.");
    expect(r).toEqual([{ id: A, title: "КП для Ашана до 10.10" }]);
  });

  it("закрытые не предлагает, даже если упомянуты", () => {
    expect(mentionedTasks(msgs, "Старая закрытая задача уже сделана.")).toEqual([]);
  });

  it("находит и в JSON, отданном текстом (get_attention)", () => {
    const m: ChatMessage[] = [{ role: "user", content: "?" }, tool({ overdue: [{ task_id: B, title: "Образцы в Ленту" }] }, true)];
    expect(mentionedTasks(m, "Просрочено: образцы в ленту.")).toEqual([{ id: B, title: "Образцы в Ленту" }]);
  });

  it("смотрит только текущий запрос, не прошлые", () => {
    const m: ChatMessage[] = [...msgs, { role: "assistant", content: "ок" }, { role: "user", content: "а ещё?" }];
    expect(mentionedTasks(m, "КП для Ашана до 10.10")).toEqual([]);
  });
});
