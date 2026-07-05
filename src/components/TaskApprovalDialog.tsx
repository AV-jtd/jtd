import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, CheckCircle2, XCircle, Paperclip, X, FileIcon, Loader2, Sparkles, AlertTriangle, ClipboardPaste, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".pptx", ".txt"];

interface TaskClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  taskId: string;
  onSubmit: (result: string, uploadedUrls: string[], summary?: string) => void;
}

export function TaskClosureDialog({ open, onOpenChange, taskTitle, taskId, onSubmit }: TaskClosureDialogProps) {
  const [result, setResult] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          const named = new File([file], `screenshot_${Date.now()}.png`, { type: file.type });
          imageFiles.push(named);
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      const available = MAX_FILES - files.length;
      if (available <= 0) return;
      const toAdd = imageFiles.slice(0, available);
      for (const f of toAdd) {
        const err = validateClientSide(f);
        if (err) { toast.error(err); return; }
      }
      uploadAndValidate(toAdd);
    }
  }, [files.length]);

  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    if (!el) return;
    el.addEventListener("paste", handlePaste as EventListener);
    return () => el.removeEventListener("paste", handlePaste as EventListener);
  }, [open, handlePaste]);

  const processDroppedFiles = useCallback((droppedFiles: File[]) => {
    const available = MAX_FILES - files.length;
    if (available <= 0) return;
    const toAdd = droppedFiles.slice(0, available);
    for (const f of toAdd) {
      const err = validateClientSide(f);
      if (err) { toast.error(err); return; }
    }
    uploadAndValidate(toAdd);
  }, [files.length]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processDroppedFiles(Array.from(e.dataTransfer.files));
    }
  }, [processDroppedFiles]);

  const handleSubmit = () => {
    if (result.trim()) {
      onSubmit(result.trim(), uploadedUrls, summary || undefined);
      setResult("");
      setFiles([]);
      setUploadedUrls([]);
      setSummary(null);
      setValidationError(null);
      onOpenChange(false);
    }
  };

  const validateClientSide = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: превышает 10 МБ (${(file.size / 1024 / 1024).toFixed(1)} МБ)`;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `${file.name}: недопустимый тип файла`;
    }
    return null;
  };

  const uploadAndValidate = async (newFiles: File[]) => {
    if (!user) return;
    setValidating(true);
    setValidationError(null);
    setSummary(null);

    try {
      // Upload files to storage
      const newUrls: string[] = [];
      for (const file of newFiles) {
        const filePath = `${user.id}/${taskId}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from("task-attachments").upload(filePath, file);
        if (upErr) throw new Error(`Ошибка загрузки ${file.name}: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from("task-attachments").getPublicUrl(filePath);
        newUrls.push(urlData.publicUrl);
      }

      // Server-side validation + AI summary
      const { data, error } = await supabase.functions.invoke("process-attachment", {
        body: { fileUrls: newUrls, taskTitle },
      });

      if (error) {
        setValidationError("Ошибка валидации файлов на сервере");
        return;
      }

      if (data && !data.valid) {
        setValidationError(data.errors?.join("; ") || "Файлы не прошли проверку");
        return;
      }

      setFiles(prev => [...prev, ...newFiles]);
      setUploadedUrls(prev => [...prev, ...newUrls]);
      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch (e: any) {
      console.error("Upload/validation error:", e);
      setValidationError(e.message || "Ошибка обработки файлов");
    } finally {
      setValidating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const incoming = Array.from(e.target.files);
      const total = [...files, ...incoming].slice(0, MAX_FILES);
      const newOnly = total.slice(files.length);

      // Client-side pre-validation
      for (const f of newOnly) {
        const err = validateClientSide(f);
        if (err) {
          toast.error(err);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      }

      uploadAndValidate(newOnly);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (files.length <= 1) {
      setSummary(null);
    }
  };

  const isImage = (file: File) => file.type.startsWith("image/");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        className="sm:max-w-md max-h-[85vh] flex flex-col gap-0 overflow-hidden relative"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drop overlay */}
        {dragging && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
            <Upload className="h-8 w-8 text-primary mb-2" />
            <p className="text-sm font-medium text-primary">Перетащите файлы сюда</p>
          </div>
        )}
        <DialogHeader className="flex-shrink-0 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            Результат выполнения
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-1">
          <p className="text-sm text-muted-foreground">
            Задача «{taskTitle}» требует утверждения. Опишите результат:
          </p>
          <Textarea
            autoFocus
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="Что было сделано, какой результат..."
            className="min-h-[100px] resize-none"
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

          {/* Validation error */}
          {validationError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{validationError}</p>
            </div>
          )}

          {/* AI Summary */}
          {summary && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 space-y-1">
              <p className="text-[11px] font-medium text-primary flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                ИИ-саммари вложений
              </p>
              <p className="text-xs text-foreground/80">{summary}</p>
            </div>
          )}

          {/* Validating indicator */}
          {validating && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Проверка и анализ файлов...
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
              disabled={files.length >= MAX_FILES || validating}
              className="gap-1.5 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Прикрепить файл
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {files.length}/{MAX_FILES} • макс. 10 МБ
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Upload className="h-3 w-3" />
            <span>Перетащите файлы или Ctrl+V для скриншота</span>
          </div>
        </div>
        <DialogFooter className="flex-shrink-0 pt-4 mt-1 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!result.trim() || validating}>
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
