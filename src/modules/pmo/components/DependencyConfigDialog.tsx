import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DependencyType, EntityType } from "@/hooks/useDependencies";

interface DependencyConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  predecessorLabel: string;
  successorLabel: string;
  predecessorEntityType: EntityType;
  successorEntityType: EntityType;
  onConfirm: (type: DependencyType, lagDays: number) => void;
}

const DEP_TYPE_LABELS: Record<DependencyType, string> = {
  FS: "Финиш → Старт (FS)",
  SS: "Старт → Старт (SS)",
  FF: "Финиш → Финиш (FF)",
  SF: "Старт → Финиш (SF)",
};

export default function DependencyConfigDialog({
  open, onOpenChange, predecessorLabel, successorLabel,
  predecessorEntityType, successorEntityType, onConfirm,
}: DependencyConfigDialogProps) {
  const [depType, setDepType] = useState<DependencyType>("FS");
  const [lagDays, setLagDays] = useState(0);

  const handleConfirm = () => {
    onConfirm(depType, lagDays);
    setDepType("FS");
    setLagDays(0);
    onOpenChange(false);
  };

  const entityLabel = (type: EntityType) =>
    type === "milestone" ? "веха" : type === "project" ? "проект" : "задача";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Настройка зависимости</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">Предшественник</span>
              <span className="text-[10px] bg-muted px-1 rounded">{entityLabel(predecessorEntityType)}</span>
            </div>
            <div className="truncate">{predecessorLabel}</div>
            <div className="text-center text-muted-foreground">↓</div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">Последователь</span>
              <span className="text-[10px] bg-muted px-1 rounded">{entityLabel(successorEntityType)}</span>
            </div>
            <div className="truncate">{successorLabel}</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Тип зависимости</Label>
            <Select value={depType} onValueChange={(v) => setDepType(v as DependencyType)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DEP_TYPE_LABELS) as DependencyType[]).map(t => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {DEP_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Задержка (дни)</Label>
            <Input
              type="number"
              min={0}
              value={lagDays}
              onChange={e => setLagDays(parseInt(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Отмена
          </Button>
          <Button size="sm" onClick={handleConfirm} className="text-xs">
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
