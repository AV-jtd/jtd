import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateKanbanBoard } from "@/hooks/useKanbanBoards";
import { useNavigate } from "react-router-dom";

interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateBoardDialog({ open, onOpenChange }: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const create = useCreateKanbanBoard();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!name.trim()) return;
    const board = await create.mutateAsync({
      name: name.trim(),
      board_type: "personal",
      group_id: null,
    });
    onOpenChange(false);
    setName("");
    navigate(`/kanban/${board.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая личная канбан-доска</DialogTitle>
          <DialogDescription>
            Чтобы создать проектную доску — откройте проект и нажмите вкладку «Канбан».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Название</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Моя доска"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || create.isPending}>
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}