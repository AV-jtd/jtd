import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Lock, Globe2, FolderOpen, Tag as TagIcon, Briefcase, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useVisibleTags, useAvailableUsers } from "@/hooks/useTasks";
import {
  useCreateDecision,
  useUpdateDecision,
  type Decision,
  type DecisionVisibility,
} from "@/hooks/useDecisions";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  protocolId: string;
  /** Optional initial source task (when launched from a protocol row). */
  sourceTaskId?: string | null;
  /** Edit mode: pass existing decision. */
  decision?: Decision | null;
  /** Pre-selected project (e.g. when launched from PMO). */
  defaultProjectId?: string | null;
  /** Pre-selected client (e.g. when launched from CRM). */
  defaultClientId?: string | null;
}

function MultiSelectPopover<T extends { id: string; name: string; color?: string | null }>({
  items,
  selectedIds,
  onChange,
  triggerLabel,
  triggerIcon,
  searchPlaceholder = "Поиск…",
}: {
  items: T[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  triggerLabel: string;
  triggerIcon: React.ReactNode;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => (q ? items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())) : items).slice(0, 100),
    [items, q],
  );
  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
            selectedIds.length > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {triggerIcon}
          <span>{triggerLabel}</span>
          {selectedIds.length > 0 && <span className="font-semibold">{selectedIds.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">Ничего не найдено</p>
          )}
          {filtered.map((it) => {
            const sel = selectedIds.includes(it.id);
            return (
              <button
                type="button"
                key={it.id}
                onClick={() => toggle(it.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs",
                  sel ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {it.color && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
                )}
                <span className="truncate">{it.name}</span>
                {sel && <Check className="ml-auto h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function DecisionDialog({
  open,
  onOpenChange,
  protocolId,
  sourceTaskId,
  decision,
  defaultProjectId,
  defaultClientId,
}: Props) {
  const isEdit = !!decision;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [decidedAt, setDecidedAt] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<DecisionVisibility>("protocol");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [viewerIds, setViewerIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (decision) {
      setTitle(decision.title);
      setBody(decision.body ?? "");
      setDecidedAt(decision.decided_at.slice(0, 10));
      setVisibility(decision.visibility);
      setProjectIds(decision.project_ids);
      setTagIds(decision.tag_ids);
      setClientIds(decision.client_ids);
      setViewerIds(decision.viewer_ids);
    } else {
      setTitle("");
      setBody("");
      setDecidedAt(new Date().toISOString().slice(0, 10));
      setVisibility("protocol");
      setProjectIds(defaultProjectId ? [defaultProjectId] : []);
      setTagIds([]);
      setClientIds(defaultClientId ? [defaultClientId] : []);
      setViewerIds([]);
    }
  }, [open, decision, defaultProjectId, defaultClientId]);

  const { data: groups = [] } = useTaskGroups();
  const { data: tags = [] } = useVisibleTags();
  const { data: users = [] } = useAvailableUsers();
  const { data: clients = [] } = useQuery({
    queryKey: ["decisions-clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name").limit(500);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    staleTime: 60_000,
    enabled: open,
  });

  const projectItems = useMemo(
    () => groups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    [groups],
  );
  const tagItems = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    [tags],
  );
  const userItems = useMemo(
    () => users.map((u) => ({ id: u.id, name: u.display_name || u.email || "Без имени" })),
    [users],
  );

  const createMut = useCreateDecision();
  const updateMut = useUpdateDecision();
  const saving = createMut.isPending || updateMut.isPending;

  const onSave = async () => {
    if (!title.trim()) {
      toast.error("Введите формулировку решения");
      return;
    }
    const payload = {
      protocol_id: protocolId,
      source_task_id: sourceTaskId ?? decision?.source_task_id ?? null,
      title: title.trim(),
      body: body.trim() || null,
      decided_at: new Date(decidedAt + "T12:00:00").toISOString(),
      visibility,
      project_ids: projectIds,
      tag_ids: tagIds,
      client_ids: clientIds,
      viewer_ids: visibility === "restricted" ? viewerIds : [],
    };
    try {
      if (isEdit && decision) {
        await updateMut.mutateAsync({ id: decision.id, ...payload });
        toast.success("Решение обновлено");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Решение сохранено");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось сохранить");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать решение" : "Новое решение"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Формулировка</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что решили?"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Контекст / детали (необязательно)</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Обоснование, ограничения, последствия…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Дата:</label>
              <Input
                type="date"
                value={decidedAt}
                onChange={(e) => setDecidedAt(e.target.value)}
                className="h-7 w-36 text-xs"
              />
            </div>
            <MultiSelectPopover
              items={projectItems}
              selectedIds={projectIds}
              onChange={setProjectIds}
              triggerLabel="Проекты"
              triggerIcon={<FolderOpen className="h-3 w-3" />}
              searchPlaceholder="Поиск проекта…"
            />
            <MultiSelectPopover
              items={tagItems}
              selectedIds={tagIds}
              onChange={setTagIds}
              triggerLabel="Оси (теги)"
              triggerIcon={<TagIcon className="h-3 w-3" />}
              searchPlaceholder="Поиск тега…"
            />
            <MultiSelectPopover
              items={(clients ?? []).map((c) => ({ id: c.id, name: c.name }))}
              selectedIds={clientIds}
              onChange={setClientIds}
              triggerLabel="Клиенты"
              triggerIcon={<Briefcase className="h-3 w-3" />}
              searchPlaceholder="Поиск клиента…"
            />
          </div>

          <div className="rounded-md border border-border p-2.5 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVisibility("protocol")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
                  visibility === "protocol"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Globe2 className="h-3 w-3" /> Видно участникам протокола / проектов
              </button>
              <button
                type="button"
                onClick={() => setVisibility("restricted")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
                  visibility === "restricted"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Lock className="h-3 w-3" /> Только указанному кругу лиц
              </button>
            </div>
            {visibility === "restricted" && (
              <div className="space-y-1.5">
                <MultiSelectPopover
                  items={userItems}
                  selectedIds={viewerIds}
                  onChange={setViewerIds}
                  triggerLabel="Кто видит"
                  triggerIcon={<Users className="h-3 w-3" />}
                  searchPlaceholder="Поиск сотрудника…"
                />
                {viewerIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {viewerIds.map((uid) => {
                      const u = userItems.find((x) => x.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                        >
                          {u?.name ?? "?"}
                          <button
                            type="button"
                            onClick={() => setViewerIds(viewerIds.filter((x) => x !== uid))}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Автор и админ всегда видят решение. Остальные — только из этого списка.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}