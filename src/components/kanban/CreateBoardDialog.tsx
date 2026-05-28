import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateKanbanBoard } from "@/hooks/useKanbanBoards";
import { useTaskGroups } from "@/hooks/useTasks";
import { useNavigate } from "react-router-dom";

interface CreateBoardDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreateBoardDialog({ open, onOpenChange }: CreateBoardDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"personal" | "project">("personal");
  const [groupId, setGroupId] = useState<string>("");
  const { data: groups = [] } = useTaskGroups();
  const create = useCreateKanbanBoard();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (type === "project" && !groupId) return;
    const board = await create.mutateAsync({
      name: name.trim(),
      board_type: type,
      group_id: type === "project" ? groupId : null,
    });
    onOpenChange(false);
    setName("");
    setGroupId("");
    navigate(`/kanban/${board.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новая канбан-доска</DialogTitle>
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

          <div className="space-y-2">
            <Label>Тип</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as "personal" | "project")} className="gap-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
                <RadioGroupItem value="personal" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Личная</p>
                  <p className="text-xs text-muted-foreground">Только вы видите эту доску</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50">
                <RadioGroupItem value="project" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Проектная</p>
                  <p className="text-xs text-muted-foreground">Доступна всем участникам проекта</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {type === "project" && (
            <div className="space-y-2">
              <Label>Проект</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите проект…" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.icon} {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || (type === "project" && !groupId) || create.isPending}
          >
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}