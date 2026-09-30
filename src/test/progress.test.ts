import { describe, it, expect } from "vitest";
import { projectProgressPct, taskProgressPct } from "@/lib/progress";

/**
 * Готовность. Правило взято из Ганта приложения, и тесты написаны именно по нему:
 * если коннектор начнёт считать иначе, число на экране и число в разговоре
 * разойдутся — молча, потому что оба выглядят правдоподобно.
 */
describe("taskProgressPct", () => {
  it("без подзадач: по отметке о выполнении", () => {
    expect(taskProgressPct({ is_completed: false })).toBe(0);
    expect(taskProgressPct({ is_completed: true })).toBe(100);
  });

  it("с подзадачами: доля выполненных", () => {
    expect(taskProgressPct({ subtasks: [{ is_completed: true }, { is_completed: false }] })).toBe(50);
    expect(taskProgressPct({ subtasks: [{ is_completed: true }, { is_completed: true }, { is_completed: false }] })).toBe(67);
  });

  // Как в приложении: подзадачи важнее отметки на самой задаче.
  it("подзадачи перевешивают отметку на задаче", () => {
    expect(taskProgressPct({ is_completed: true, subtasks: [{ is_completed: false }] })).toBe(0);
  });

  it("пустой список подзадач — как будто их нет", () => {
    expect(taskProgressPct({ is_completed: true, subtasks: [] })).toBe(100);
  });
});

describe("projectProgressPct", () => {
  it("среднее по задачам", () => {
    expect(projectProgressPct([{ is_completed: true }, { is_completed: false }])).toBe(50);
  });

  it("среднее невзвешенное: длительность не учитывается", () => {
    // Три задачи, одна готова — тридцать три процента, независимо от объёма.
    expect(projectProgressPct([{ is_completed: true }, { is_completed: false }, { is_completed: false }])).toBe(33);
  });

  it("нет задач — null, а не ноль: «ноль процентов» и «считать нечего» разные вещи", () => {
    expect(projectProgressPct([])).toBeNull();
  });
});
