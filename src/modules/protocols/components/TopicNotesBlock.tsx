import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * «Выводы» по теме внутри living-протокола.
 * Хранятся в protocol_meta.topic_notes[tag_id] как markdown-строка.
 * Поддерживает буллеты через "- " / "* " — подсвечиваются как список.
 * Минималистичный inline-редактор, как в Notion.
 */

interface Props {
  protocolId: string;
  protocolMeta: any;
  topicKey: string; // tag_id или "__no_topic__"
  className?: string;
}

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const out: JSX.Element[] = [];
  let bulletGroup: string[] = [];
  const flushBullets = () => {
    if (bulletGroup.length === 0) return;
    out.push(
      <ul key={`b-${out.length}`} className="my-1 list-disc space-y-0.5 pl-5 text-sm text-foreground/90">
        {bulletGroup.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
    bulletGroup = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      bulletGroup.push(m[1]);
    } else {
      flushBullets();
      if (line.trim() === "") {
        out.push(<div key={`s-${out.length}`} className="h-1.5" />);
      } else {
        out.push(
          <p key={`p-${out.length}`} className="text-sm text-foreground/90">
            {line}
          </p>,
        );
      }
    }
  }
  flushBullets();
  return out;
}

export default function TopicNotesBlock({ protocolId, protocolMeta, topicKey, className }: Props) {
  const qc = useQueryClient();
  const value: string = (protocolMeta?.topic_notes?.[topicKey] as string) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      const newMeta = {
        ...(protocolMeta ?? {}),
        topic_notes: {
          ...((protocolMeta?.topic_notes as Record<string, string>) ?? {}),
          [topicKey]: next,
        },
      };
      // Если значение пустое — удаляем ключ, чтобы не засорять meta.
      if (!next.trim()) {
        delete newMeta.topic_notes[topicKey];
      }
      const { error } = await supabase
        .from("task_groups")
        .update({ protocol_meta: newMeta as any })
        .eq("id", protocolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error("Не удалось сохранить выводы: " + e.message),
  });

  if (editing) {
    return (
      <div className={cn("rounded-md border border-primary/40 bg-background p-2", className)}>
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="- Ключевой вывод&#10;- Договорились о…&#10;- Решение по теме"
          className="min-h-[80px] resize-y border-0 bg-transparent p-1 text-sm focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              save.mutate(draft);
            }
          }}
        />
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            Поддерживается markdown: «- » для буллетов. <kbd className="rounded border border-border bg-muted px-1">⌘↵</kbd> сохранить
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" /> Отмена
            </button>
            <button
              type="button"
              onClick={() => save.mutate(draft)}
              disabled={save.isPending}
              className="inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-primary-foreground hover:bg-primary/90"
            >
              <Check className="h-3 w-3" /> Сохранить
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!value.trim()) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs italic text-muted-foreground hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Pencil className="h-3 w-3 opacity-60 group-hover:opacity-100" />
        Добавить выводы по теме
      </button>
    );
  }

  return (
    <div className={cn("group relative rounded-md bg-muted/30 px-3 py-2", className)}>
      <div className="space-y-0.5">{renderMarkdown(value)}</div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="absolute right-1 top-1 inline-flex items-center gap-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
        aria-label="Редактировать выводы"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}