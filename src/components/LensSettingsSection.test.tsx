import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LensSettingsSection, { LensToggleInline } from "./LensSettingsSection";

// --- Mocks ---------------------------------------------------------------

const updateMock = vi.fn(async () => ({ error: null }));
const insertMock = vi.fn(async () => ({ error: null }));

let viewMode: "lens" | "container" = "container";
let linkedTagIds: string[] = [];

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const fromImpl = (table: string) => {
    if (table === "task_groups") {
      return {
        update: (patch: any) => {
          if (patch.view_mode) viewMode = patch.view_mode;
          return { eq: async () => updateMock() };
        },
      };
    }
    if (table === "task_group_linked_tags") {
      return {
        select: () => ({
          eq: async () => ({
            data: linkedTagIds.map((id) => ({ tag_id: id })),
            error: null,
          }),
        }),
        insert: async (row: any) => {
          linkedTagIds = [...linkedTagIds, row.tag_id];
          return insertMock();
        },
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      };
    }
    if (table === "task_tags") {
      return {
        select: () => ({
          in: async () => ({
            // Two unique task ids => count = 2
            data: linkedTagIds.length
              ? [{ task_id: "t1" }, { task_id: "t2" }, { task_id: "t1" }]
              : [],
            error: null,
          }),
        }),
      };
    }
    return {} as any;
  };
  return { supabase: { from: fromImpl } };
});

const group = {
  id: "g1",
  name: "Качество",
  parent_id: null,
  project_type: "regular",
  view_mode: "container",
} as any;

vi.mock("@/hooks/useTasks", () => ({
  useTaskGroups: () => ({ data: [{ ...group, view_mode: viewMode }] }),
  useVisibleTags: () => ({
    data: [
      { id: "tag-a", name: "Brand A", color: "#f00", category_id: "cat-1" },
      { id: "tag-b", name: "Brand B", color: "#0f0", category_id: "cat-1" },
    ],
  }),
  useTagCategories: () => ({
    data: [{ id: "cat-1", name: "Бренды", parent_id: null }],
  }),
}));

// --- Helpers -------------------------------------------------------------

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  viewMode = "container";
  linkedTagIds = [];
  updateMock.mockClear();
  insertMock.mockClear();
});

// --- Test ----------------------------------------------------------------

describe("LensSettingsSection — переключение и счётчик задач", () => {
  it("клик по переключателю включает линзу, показывает блок тегов и обновляет счётчик", async () => {
    renderWith(
      <>
        <LensToggleInline group={group} />
        <LensSettingsSection group={group} />
      </>
    );

    // 1) Изначально блок тегов скрыт
    expect(screen.queryByText("Тэги линзы")).not.toBeInTheDocument();

    // 2) Клик по Switch
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);

    // 3) Появляется блок тегов
    await waitFor(() =>
      expect(screen.getByText("Тэги линзы")).toBeInTheDocument()
    );
    expect(updateMock).toHaveBeenCalled();

    // 4) Изначально подсказка про пустую линзу
    expect(
      screen.getByText(/Привяжите хотя бы один тег/i)
    ).toBeInTheDocument();

    // 5) Открываем picker и выбираем тэг
    fireEvent.click(screen.getByText(/Привязать тэги/i));
    const tagBtn = await screen.findByText("Brand A");
    fireEvent.click(tagBtn);

    // 6) Счётчик обновляется: 2 уникальные задачи (t1, t2)
    await waitFor(() =>
      expect(screen.getByText(/Найдено задач: 2/i)).toBeInTheDocument()
    );
  });
});