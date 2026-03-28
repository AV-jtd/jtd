import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, XCircle } from "lucide-react";

interface TaskClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onSubmit: (result: string) => void;
}

export function TaskClosureDialog({ open, onOpenChange, taskTitle, onSubmit }: TaskClosureDialogProps) {
  const [result, setResult] = useState("");

  const handleSubmit = () => {
    if (result.trim()) {
      onSubmit(result.trim());
      setResult("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Результат выполнения
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Задача «{taskTitle}» требует утверждения. Опишите результат:
          </p>
          <Textarea
            autoFocus
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Что было сделано, какой результат..."
            className="min-h-[120px] resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!result.trim()}>
            Отправить на утверждение
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TaskApprovalActionsProps {
  taskTitle: string;
  closureResult: string | null;
  onApprove: () => void;
  onReject: () => void;
}

export function TaskApprovalActions({ taskTitle, closureResult, onApprove, onReject }: TaskApprovalActionsProps) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
        ⏳ Ожидает вашего утверждения
      </p>
      {closureResult && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Результат исполнителя:</p>
          <p className="text-sm text-foreground/80 bg-muted/50 rounded px-2.5 py-2 whitespace-pre-wrap">{closureResult}</p>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onApprove} className="h-7 text-xs gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Утвердить
        </Button>
        <Button size="sm" variant="outline" onClick={onReject} className="h-7 text-xs gap-1 text-destructive hover:text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          Отклонить
        </Button>
      </div>
    </div>
  );
}
