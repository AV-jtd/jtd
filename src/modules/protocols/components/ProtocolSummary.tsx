import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { Sparkles, Lock, Globe, Loader2, FileText, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

type SummaryScope = "internal" | "public";

interface SummaryMeta {
  enabled?: boolean;
  scope?: SummaryScope;
  text?: string;
  updated_at?: string;
}

interface ProtocolMetaShape {
  summary?: SummaryMeta;
  [key: string]: unknown;
}

interface Props {
  protocolId: string;
  protocolName: string;
  protocolMeta: ProtocolMetaShape | null | undefined;
  /** Hide the editing controls (used in public preview to render text only) */
  readOnly?: boolean;
}

export default function ProtocolSummary({ protocolId, protocolName, protocolMeta, readOnly }: Props) {
  const qc = useQueryClient();
  const { data: tasks = [] } = useTasks(protocolId);
  const { data: users = [] } = useAvailableUsers();

  const initial: SummaryMeta = protocolMeta?.summary ?? {};
  const [enabled, setEnabled] = useState<boolean>(!!initial.enabled);
  const [scope, setScope] = useState<SummaryScope>(initial.scope ?? "internal");
  const [text, setText] = useState<string>(initial.text ?? "");
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Sync from server when data changes
  useEffect(() => {
    setEnabled(!!initial.enabled);
    setScope(initial.scope ?? "internal");
    setText(initial.text ?? "");
  }, [initial.enabled, initial.scope, initial.text]);

  const saveMut = useMutation({
    mutationFn: async (next: SummaryMeta) => {
      const merged: ProtocolMetaShape = {
        ...(protocolMeta ?? {}),
        summary: { ...next, updated_at: new Date().toISOString() },
      };
      const { error } = await supabase
        .from("task_groups")
        .update({ protocol_meta: merged as any })
        .eq("id", protocolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
    },
    onError: (e: Error) => toast.error("Не удалось сохранить: " + e.message),
  });

  const handleToggleEnabled = (v: boolean) => {
    setEnabled(v);
    saveMut.mutate({ enabled: v, scope, text });
  };

  const handleScopeChange = (next: SummaryScope) => {
    setScope(next);
    saveMut.mutate({ enabled, scope: next, text });
  };

  const handleSave = () => {
    saveMut.mutate({ enabled, scope, text });
    setEditing(false);
    toast.success("Саммари сохранено");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const userMap = new Map(users.map((u) => [u.id, u.display_name || u.email || ""]));
      const payloadTasks = tasks
        .filter((t) => t.group_id === protocolId)
        .map((t) => ({
          title: t.title,
          description: t.description ?? null,
          assignee: t.assigned_to ? userMap.get(t.assigned_to) ?? null : null,
          deadline: t.deadline ? format(new Date(t.deadline), "dd.MM.yyyy") : null,
          status: t.is_completed ? "выполнено" : null,
        }));

      const { data, error } = await supabase.functions.invoke("generate-protocol-summary", {
        body: { protocolName, tasks: payloadTasks, scope },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const generated = (data?.summary ?? "").trim();
      if (!generated) throw new Error("Пустой ответ ИИ");
      setText(generated);
      setEditing(true);
      toast.success("Черновик саммари готов — отредактируйте и сохраните");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка генерации";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const hasContent = !!text.trim();
  const ScopeIcon = scope === "public" ? Globe : Lock;
  const scopeLabel = scope === "public" ? "Публичное" : "Внутреннее";
  const scopeHint = scope === "public"
    ? "Виден всем, кому открыт опубликованный протокол"
    : "Видно только участникам проекта";

  // Read-only render (used in public preview)
  if (readOnly) {
    if (!enabled || !hasContent || scope !== "public") return null;
    return (
      <section className="mb-5 rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Саммари встречи
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{text}</p>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "mb-5 rounded-xl border bg-card transition-colors",
        enabled ? "border-primary/30" : "border-dashed border-border",
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
              enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Саммари встречи</p>
            <p className="text-xs text-muted-foreground">
              {enabled ? "Краткий текстовый итог встречи" : "Опциональный блок — включите, чтобы добавить итоги"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {enabled && (
            <button
              type="button"
              onClick={() => handleScopeChange(scope === "internal" ? "public" : "internal")}
              title={scopeHint}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                scope === "public"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              <ScopeIcon className="h-3 w-3" />
              {scopeLabel}
            </button>
          )}
          <Switch checked={enabled} onCheckedChange={handleToggleEnabled} aria-label="Включить саммари" />
        </div>
      </div>

      {/* Body */}
      {enabled && (
        <div className="border-t border-border px-4 py-3">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Опишите итоги встречи: что обсудили, ключевые решения, следующие шаги…"
                className="min-h-[140px] resize-y text-sm"
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="h-8 gap-1.5 text-primary hover:text-primary"
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {generating ? "Генерируем…" : "Перегенерировать ИИ"}
                </Button>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setText(initial.text ?? "");
                      setEditing(false);
                    }}
                    className="h-8"
                  >
                    Отмена
                  </Button>
                  <Button type="button" size="sm" onClick={handleSave} className="h-8">
                    Сохранить
                  </Button>
                </div>
              </div>
            </div>
          ) : hasContent ? (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{text}</p>
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  ИИ-черновик
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="h-7 gap-1.5 text-xs"
                >
                  Редактировать
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Напишите саммари вручную или сгенерируйте черновик по задачам протокола.
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="h-8 gap-1.5"
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  ИИ-черновик
                </Button>
                <Button type="button" size="sm" onClick={() => setEditing(true)} className="h-8">
                  Написать
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
