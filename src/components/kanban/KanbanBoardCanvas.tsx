import { useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { Settings, Loader2, Plus, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BoardColumn } from "@/components/board/BoardColumn";
import { DraggableWrapper } from "@/components/board/DraggableWrapper";
import { useBoardDnd } from "@/hooks/useBoardDnd";
import {
  useKanbanBoard,
  useMoveCard,
  useColumnMutations,
  type KanbanColumn as KanbanColumnT,
} from "@/hooks/useKanbanBoards";
import { useTasks, useAvailableUsers, useTaskMutations, type Task } from "@/hooks/useTasks";
import TaskCreateBar from "@/components/task-list/TaskCreateBar";
import { KanbanCard } from "@/components/kanban/KanbanCard";
import { BoardSettingsDialog } from "@/components/kanban/BoardSettingsDialog";
import { cn } from "@/lib/utils";

const STEP = 1000;

interface KanbanBoardCanvasProps {
  boardId: string;
  /** Show local header with board name + settings button. Off when host already shows a header (e.g. project page). */
  showHeader?: boolean;
  /** Force the settings button always (even with showHeader=false) as a floating action. */
  exposeSettings?: boolean;
}

export function KanbanBoardCanvas({ boardId, showHeader = true, exposeSettings = false }: KanbanBoardCanvasProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useKanbanBoard(boardId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const { data: availableUsers = [] } = useAvailableUsers();
  const { addTask } = useTaskMutations();

  const board = data?.board;
  const columns = data?.columns ?? [];
  const positions = data?.positions ?? [];

  const { data: tasks = [], isLoading: tasksLoading } = useTasks(
    board?.board_type === "project" ? board.group_id : null,
    null,
    { enabled: !!board },
  );

  const posByTask = useMemo(() => {
    const m = new Map<string, (typeof positions)[number]>();
    for (const p of positions) m.set(p.task_id, p);
    return m;
  }, [positions]);

  const firstColumnId = columns[0]?.id;
  const cardsByColumn = useMemo(() => {
    const out = new Map<string, Task[]>();
    for (const c of columns) out.set(c.id, []);
    for (const t of tasks) {
      const p = posByTask.get(t.id);
      const colId = p?.column_id && out.has(p.column_id) ? p.column_id : firstColumnId;
      if (!colId) continue;
      out.get(colId)!.push(t);
    }
    for (const [, arr] of out) {
      arr.sort((a, b) => {
        const pa = posByTask.get(a.id)?.position;
        const pb = posByTask.get(b.id)?.position;
        if (pa != null && pb != null) return pa - pb;
        if (pa != null) return -1;
        if (pb != null) return 1;
        return (a.position ?? 0) - (b.position ?? 0);
      });
    }
    return out;
  }, [columns, tasks, posByTask, firstColumnId]);

  const moveCard = useMoveCard(boardId);

  const handleDrop = useCallback(
    (taskId: string, columnId: string) => {
      const list = cardsByColumn.get(columnId) ?? [];
      const last = list[list.length - 1];
      const lastPos = last && posByTask.get(last.id)?.position;
      const newPos = (lastPos ?? list.length * STEP) + STEP;
      const targetCol = columns.find((c) => c.id === columnId);
      const mapping = (targetCol?.mapping_json ?? null) as { is_completed?: boolean } | null;
      moveCard.mutate({
        task_id: taskId,
        column_id: columnId,
        position: newPos,
        completeTask: mapping?.is_completed,
      });
    },
    [cardsByColumn, columns, posByTask, moveCard],
  );

  // Create a task and place it into a specific column.
  // If columnId is omitted, the task lands in the first column (default).
  const createTaskInColumn = useCallback(
    async (
      payload: {
        title: string;
        group_id: string | null;
        deadline: string | null;
        assigned_to?: string | null;
        department_id?: string | null;
        contractor_id?: string | null;
        task_type: "standard" | "crm";
        client_name?: string;
      },
      columnId?: string,
    ) => {
      if (!board) return;
      const effectiveGroupId =
        board.board_type === "project" ? board.group_id ?? null : payload.group_id;
      const created: any = await addTask.mutateAsync({
        ...payload,
        group_id: effectiveGroupId,
      });
      const targetColId = columnId ?? firstColumnId;
      if (created?.id && targetColId) {
        const list = cardsByColumn.get(targetColId) ?? [];
        const last = list[list.length - 1];
        const lastPos = last && posByTask.get(last.id)?.position;
        const newPos = (lastPos ?? list.length * STEP) + STEP;
        const targetCol = columns.find((c) => c.id === targetColId);
        const mapping = (targetCol?.mapping_json ?? null) as { is_completed?: boolean } | null;
        moveCard.mutate({
          task_id: created.id,
          column_id: targetColId,
          position: newPos,
          completeTask: mapping?.is_completed,
        });
      }
    },
    [addTask, board, cardsByColumn, columns, firstColumnId, moveCard, posByTask],
  );

  const dropKeys = useMemo(() => columns.map((c) => c.id), [columns]);
  const { dndContextProps, overColumn, activeId } = useBoardDnd({ dropKeys, onDrop: handleDrop });
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!board) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-4 text-muted-foreground">Доска не найдена или у вас нет доступа.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {showHeader && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-3 md:px-6">
          <h1 className="flex-1 truncate text-lg font-semibold">{board.name}</h1>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {board.board_type === "personal" ? "Личная" : "Проектная"}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Quick create bar — same UX as the global "Все задачи" view */}
      <div className="shrink-0 border-b border-border bg-background/60 px-4 pt-3 md:px-6">
        <TaskCreateBar
          inputRef={createInputRef}
          activeView={board.board_type === "project" ? "group" : "today"}
          activeGroupId={board.group_id ?? null}
          availableUsers={availableUsers}
          onCreateTask={(payload) => {
            void createTaskInColumn(payload);
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext {...dndContextProps}>
          <div className="flex h-full min-w-min">
            {columns.map((col) => (
              <KanbanColumnView
                key={col.id}
                column={col}
                cards={cardsByColumn.get(col.id) ?? []}
                isOver={overColumn === col.id}
                onCardClick={(taskId) =>
                  navigate(`/?task=${taskId}${board.group_id ? `&group=${board.group_id}` : ""}`)
                }
                onQuickAdd={(title) =>
                  createTaskInColumn(
                    {
                      title,
                      group_id: board.group_id ?? null,
                      deadline: null,
                      task_type: "standard",
                    },
                    col.id,
                  )
                }
              />
            ))}
            <AddColumnButton boardId={boardId} columns={columns} />
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-72 rotate-2 opacity-90">
                <KanbanCard task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {exposeSettings && !showHeader && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки доски"
          className="fixed bottom-4 right-4 z-10 shadow-md"
        >
          <Settings className="h-4 w-4" />
        </Button>
      )}

      <BoardSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        board={board}
        columns={columns}
      />

      {tasksLoading && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
          Загрузка задач…
        </div>
      )}
    </div>
  );
}

function KanbanColumnView({
  column,
  cards,
  isOver,
  onCardClick,
  onQuickAdd,
}: {
  column: KanbanColumnT;
  cards: Task[];
  isOver: boolean;
  onCardClick: (taskId: string) => void;
  onQuickAdd: (title: string) => void | Promise<void>;
}) {
  const wipExceeded = column.wip_limit != null && cards.length > column.wip_limit;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const submit = () => {
    const t = draft.trim();
    if (!t) {
      setAdding(false);
      return;
    }
    void onQuickAdd(t);
    setDraft("");
    setAdding(false);
  };
  return (
    <BoardColumn
      columnKey={column.id}
      isOver={isOver}
      className={cn(wipExceeded && "ring-2 ring-inset ring-destructive/40")}
      header={
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: column.color }} />
          <span className="flex-1 truncate text-sm font-semibold">{column.name}</span>
          <span
            className={cn(
              "tabular-nums text-xs",
              wipExceeded ? "text-destructive font-semibold" : "text-muted-foreground",
            )}
          >
            {cards.length}
            {column.wip_limit != null && ` / ${column.wip_limit}`}
          </span>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Добавить задачу в колонку"
            aria-label="Добавить задачу в колонку"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      {adding && (
        <div className="p-2">
          <div className="rounded-lg border border-primary/30 bg-card p-2 shadow-sm">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={submit}
              placeholder="Название задачи…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <div className="mt-1.5 flex items-center justify-end gap-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Отмена"
              >
                <X className="h-3 w-3" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={submit}
                disabled={!draft.trim()}
                className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}
      {cards.map((task) => (
        <DraggableWrapper key={task.id} id={task.id}>
          {({ dragHandleProps }) => (
            <KanbanCard
              task={task}
              onClick={() => onCardClick(task.id)}
              dragHandleProps={dragHandleProps as unknown as React.HTMLAttributes<HTMLElement>}
            />
          )}
        </DraggableWrapper>
      ))}
      {cards.length === 0 && !adding && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">Перетащите карточку сюда</p>
      )}
    </BoardColumn>
  );
}

function AddColumnButton({ boardId, columns }: { boardId: string; columns: KanbanColumnT[] }) {
  const { addColumn } = useColumnMutations(boardId);
  return (
    <div className="flex w-64 shrink-0 items-start p-3">
      <button
        onClick={() => {
          const maxPos = columns.reduce((m, c) => Math.max(m, c.position), -1);
          addColumn.mutate({ name: "Новая колонка", position: maxPos + 1 });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4" /> Колонка
      </button>
    </div>
  );
}