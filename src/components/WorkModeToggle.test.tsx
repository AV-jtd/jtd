import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkModeToggleInline } from "./WorkModeToggle";
import type { TaskGroup } from "@/hooks/useTasks";

/**
 * Переключатель «Поток». Проверяется главное обещание: включение потока не
 * только пишет признак, но и снимает фиксацию базового плана — вместе с
 * подпроектами. Если снятие потеряется, поток останется с утверждённым планом,
 * и каждый перенос срока продолжит писаться как отклонение. Тихо.
 */

const patches: Array<Record<string, unknown>> = [];
const unlockedIds: string[][] = [];

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => ({ data: [{ id: "sub-1" }], error: null }) }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch);
        return {
          eq: async () => ({ error: null }),
          in: async (_col: string, ids: string[]) => {
            unlockedIds.push(ids);
            return { error: null };
          },
        };
      },
    }),
  },
}));

let group: TaskGroup;
vi.mock("@/hooks/useTasks", () => ({ useTaskGroups: () => ({ data: [group] }) }));

const base = (extra: Partial<TaskGroup> = {}) =>
  ({
    id: "p-1",
    name: "Продажи мечты",
    project_type: "standard",
    parent_id: null,
    ...extra,
  }) as unknown as TaskGroup;

const renderToggle = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkModeToggleInline group={group} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  patches.length = 0;
  unlockedIds.length = 0;
});

describe("WorkModeToggleInline", () => {
  it("включение потока снимает фиксацию базового плана вместе с подпроектами", async () => {
    group = base({ baseline_status: "locked" });
    renderToggle();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(patches.some((p) => p.work_mode === "flow")).toBe(true));
    await waitFor(() =>
      expect(patches.some((p) => p.baseline_status === "planning" && p.baseline_locked_at === null)).toBe(true),
    );
    // Проект и его подпроект.
    expect(unlockedIds[0]).toEqual(["p-1", "sub-1"]);
  });

  it("если план и не был зафиксирован, фиксацию не трогаем", async () => {
    group = base({ baseline_status: "planning" });
    renderToggle();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(patches.some((p) => p.work_mode === "flow")).toBe(true));
    expect(patches.some((p) => "baseline_status" in p)).toBe(false);
  });

  it("выключение потока ставит plan и фиксацию не возвращает", async () => {
    group = base({ work_mode: "flow", baseline_status: "planning" });
    renderToggle();
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(patches.some((p) => p.work_mode === "plan")).toBe(true));
    expect(patches.some((p) => p.baseline_status === "locked")).toBe(false);
  });

  it("у подпроекта переключателя нет: режим наследуется от родителя", () => {
    group = base({ parent_id: "parent-1" });
    renderToggle();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("у НИОКР и протоколов переключателя нет: у них свой жизненный цикл", () => {
    for (const project_type of ["npd", "crm", "protocol"]) {
      group = base({ project_type });
      const { unmount } = renderToggle();
      expect(screen.queryByRole("switch")).toBeNull();
      unmount();
    }
  });
});
