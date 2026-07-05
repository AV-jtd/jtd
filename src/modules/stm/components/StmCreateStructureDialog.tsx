import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateStmStructureNode, type StmGroupField } from "../hooks/useStmProjects";
import type { StmFlow } from "../lib/stages";

const FIELD_LABEL: Record<StmGroupField, { title: string; label: string; placeholder: string }> = {
  brand: { title: "Новый бренд", label: "Название бренда", placeholder: "СТМ / собственный" },
  project: { title: "Новый проект", label: "Название проекта", placeholder: "Бережное томление, Чистые составы..." },
  drop: { title: "Новый дроп", label: "Дроп / контракт", placeholder: "Q2 2026, Контракт #123" },
  retailer: { title: "Новая сеть", label: "Название сети", placeholder: "X5, ВкусВилл..." },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  field: StmGroupField;
  flow: StmFlow;
  existingValues?: string[];
}

export default function StmCreateStructureDialog({ open, onOpenChange, field, flow, existingValues = [] }: Props) {
  const [value, setValue] = useState("");
  const create = useCreateStmStructureNode();
  const cfg = FIELD_LABEL[field];

  useEffect(() => { if (open) setValue(""); }, [open, field]);

  const trimmed = value.trim();
  const duplicate = trimmed.length > 0 &&
    existingValues.some(v => v.toLowerCase() === trimmed.toLowerCase());

  const submit = async () => {
    if (!trimmed || duplicate) return;
    await create.mutateAsync({ flow, field, value: trimmed });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-1">
          <Label htmlFor="stm-structure-value">{cfg.label} *</Label>
          <Input
            id="stm-structure-value"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            placeholder={cfg.placeholder}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Создаётся пустая группа-заготовка ({flow === "in" ? "Ввод" : "Вывод"} SKU). SKU можно добавить позже.
          </p>
          {duplicate && <p className="text-xs text-destructive">Такая группа уже существует.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={submit} disabled={!trimmed || duplicate || create.isPending}>
            {create.isPending ? "Создание..." : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
