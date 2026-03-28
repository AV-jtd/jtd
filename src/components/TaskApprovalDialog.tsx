import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, XCircle, Paperclip, Image, X, FileIcon } from "lucide-react";

interface TaskClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onSubmit: (result: string, files: File[]) => void;
}

export function TaskClosureDialog({ open, onOpenChange, taskTitle, onSubmit }: TaskClosureDialogProps) {
  const [result, setResult] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (result.trim()) {
      onSubmit(result.trim(), files);
      setResult("");
      setFiles([]);
      onOpenChange(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const isImage = (file: File) => file.type.startsWith("image/");

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

          {/* File previews */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((file, idx) => (
                <div key={idx} className="relative group rounded-md border border-border bg-muted/50 p-1.5 flex items-center gap-1.5 max-w-[200px]">
                  {isImage(file) ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-10 w-10 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-xs truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Attach button */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= 5}
              className="gap-1.5 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Прикрепить файл
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {files.length}/5 файлов (макс. 20 МБ)
            </span>
          </div>
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
  closureAttachments?: string[];
  onApprove: () => void;
  onReject: () => void;
}

export function TaskApprovalActions({ taskTitle, closureResult, closureAttachments, onApprove, onReject }: TaskApprovalActionsProps) {
  const attachments = closureAttachments || [];
  const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);

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
      {attachments.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Вложения:</p>
          <div className="flex flex-wrap gap-2">
            {attachments.map((url, idx) => (
              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block">
                {isImageUrl(url) ? (
                  <img src={url} alt={`attachment-${idx}`} className="h-16 w-16 rounded-md object-cover border border-border hover:ring-2 hover:ring-primary/50 transition-all" />
                ) : (
                  <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1.5 hover:bg-muted transition-colors">
                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-foreground/80 max-w-[120px] truncate">
                      {decodeURIComponent(url.split("/").pop() || "файл")}
                    </span>
                  </div>
                )}
              </a>
            ))}
          </div>
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
