import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, GripVertical } from "lucide-react";
import { useColumnMutations, useUpdateKanbanBoard, useDeleteKanbanBoard, type KanbanBoard, type KanbanColumn } from "@/hooks/useKanbanBoards";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

const COLOR_PRESETS = ["#94A3B8", "#3B82F6", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  board: KanbanBoard;
  columns: KanbanColumn[];
}

export function BoardSettingsDialog({ open, onOpenChange, board, columns }: Props) {
  const [name, setName] = useState(board.name);
  const updateBoard = useUpdateKanbanBoard();
  const deleteBoard = useDeleteKanbanBoard();
  const { addColumn, updateColumn, deleteColumn } = useColumnMutations(board.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();

  useEffect(() => setName(board.name), [board.name]);

  const handleSaveName = () => {
    if (name.trim() && name !== board.name) {
      updateBoard.mutate({ id: board.id, name: name.trim() });
    }
  };

  const handleAddColumn = () => {
    const maxPos = columns.reduce((m, c) => Math.max(m, c.position), -1);
    addColumn.mutate({ name: "Новая колонка", position: maxPos + 1 });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Настройки доски</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Колонки</Label>
                <Button size="sm" variant="ghost" onClick={handleAddColumn}>
                  <Plus className="h-4 w-4" /> Добавить
                </Button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {columns.map((col) => (
                  <ColumnRow
                    key={col.id}
                    column={col}
                    onUpdate={(patch) => updateColumn.mutate({ id: col.id, ...patch })}
                    onDelete={() => deleteColumn.mutate(col.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="justify-between sm:justify-between">
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" /> Удалить доску
            </Button>
            <Button onClick={() => onOpenChange(false)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить доску?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Задачи останутся, удалится только сама доска и её колонки.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await deleteBoard.mutateAsync(board.id);
                navigate("/kanban");
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ColumnRow({
  column,
  onUpdate,
  onDelete,
}: {
  column: KanbanColumn;
  onUpdate: (patch: { name?: string; color?: string; wip_limit?: number | null }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(column.name);
  const [wip, setWip] = useState<string>(column.wip_limit?.toString() ?? "");
  useEffect(() => setName(column.name), [column.name]);
  useEffect(() => setWip(column.wip_limit?.toString() ?? ""), [column.wip_limit]);

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div className="relative">
        <button
          className="h-6 w-6 rounded-full border-2 border-background ring-1 ring-border"
          style={{ backgroundColor: column.color }}
          aria-label="Цвет"
        >
          <input
            type="color"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={column.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            list={`presets-${column.id}`}
          />
        </button>
      </div>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== column.name && name.trim() && onUpdate({ name: name.trim() })}
        className="h-8 flex-1"
      />
      <Input
        value={wip}
        onChange={(e) => setWip(e.target.value)}
        onBlur={() => {
          const n = wip ? parseInt(wip, 10) : null;
          if (n !== column.wip_limit) onUpdate({ wip_limit: Number.isFinite(n as number) ? n : null });
        }}
        placeholder="WIP"
        className="h-8 w-16 text-center text-xs"
      />
      <button
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        aria-label="Удалить колонку"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex gap-0.5">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => onUpdate({ color: c })}
            className="h-3 w-3 rounded-full ring-1 ring-border hover:scale-125 transition-transform"
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}