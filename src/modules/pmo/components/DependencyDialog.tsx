import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DependencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  predecessorLabel: string;
  successorLabel: string;
  initialType?: string;
  initialLag?: number;
  editMode?: boolean;
  onConfirm: (type: string, lagDays: number) => void;
  onDelete?: () => void;
}

const DEP_TYPES = [
  { value: "FS", label: "Финиш → Старт (FS)", desc: "Преемник начинается после завершения предшественника" },
  { value: "SS", label: "Старт → Старт (SS)", desc: "Оба начинаются одновременно" },
  { value: "FF", label: "Финиш → Финиш (FF)", desc: "Оба завершаются одновременно" },
  { value: "SF", label: "Старт → Финиш (SF)", desc: "Преемник завершается при начале предшественника" },
];

export default function DependencyDialog({ open, onOpenChange, predecessorLabel, successorLabel, initialType, initialLag, editMode, onConfirm, onDelete }: DependencyDialogProps) {
  const [depType, setDepType] = useState(initialType || "FS");
  const [lagDays, setLagDays] = useState(initialLag ?? 0);

  // Reset state when dialog opens with new values
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setDepType(initialType || "FS");
      setLagDays(initialLag ?? 0);
    }
    onOpenChange(o);
  };

  const handleConfirm = () => {
    onConfirm(depType, lagDays);
    setDepType("FS");
    setLagDays(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{editMode ? "Редактировать зависимость" : "Создать зависимость"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
            <span className="font-medium text-foreground truncate max-w-[140px]">{predecessorLabel}</span>
            <span>→</span>
            <span className="font-medium text-foreground truncate max-w-[140px]">{successorLabel}</span>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Тип зависимости</Label>
            <Select value={depType} onValueChange={setDepType}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEP_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-muted-foreground text-[10px]">{t.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Задержка (дни)</Label>
            <Input
              type="number"
              value={lagDays}
              onChange={e => setLagDays(parseInt(e.target.value) || 0)}
              className="h-9 text-xs"
              min={-365}
              max={365}
            />
            <p className="text-[10px] text-muted-foreground">
              Положительное значение — задержка, отрицательное — опережение
            </p>
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {editMode && onDelete ? (
            <Button variant="destructive" size="sm" onClick={() => { onDelete(); onOpenChange(false); }}>
              Удалить
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button size="sm" onClick={handleConfirm}>{editMode ? "Сохранить" : "Создать"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
