import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Search, Loader2, Link2, ListChecks, FolderKanban, FileText } from "lucide-react";

type EntityKind = "tasks" | "projects" | "protocols";

type Row = {
  id: string;
  title: string;
  linked: boolean;
  ownedByMe?: boolean;
  hint?: string | null;
  meta?: any;
};

/**
 * Единый диалог привязки сущностей к клиенту прямо из комнаты клиента.
 * Три вкладки:
 *  - Задачи     → `tasks.client_id`
 *  - Проекты    → `task_groups.client_id` (подпроекты подтягиваются автоматически)
 *  - Протоколы  → `protocol_meta.client_id`
 * Уже привязанные элементы отмечены; снятие галочки = отвязка.
 */
export default function BulkLinkTasksDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
}) {
  const [kind, setKind] = useState<EntityKind>("tasks");

  const TABS: { key: EntityKind; label: string; icon: typeof ListChecks }[] = [
    { key: "tasks", label: "Задачи", icon: ListChecks },
    { key: "projects", label: "Проекты", icon: FolderKanban },
    { key: "protocols", label: "Протоколы", icon: FileText },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">Привязать к «{clientName}»</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setKind(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                kind === t.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <LinkPanel
          key={kind}
          kind={kind}
          clientId={clientId}
          open={open}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function LinkPanel({
  kind, clientId, open, onDone,
}: {
  kind: EntityKind;
  clientId: string;
  open: boolean;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlyLinked, setOnlyLinked] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["link_panel", kind, clientId, open],
    queryFn: async (): Promise<Row[]> => {
      if (kind === "tasks") {
        const { data } = await supabase
          .from("tasks")
          .select("id, title, client_id, user_id, is_completed, deadline")
          .eq("is_completed", false)
          .order("created_at", { ascending: false })
          .limit(500);
        return ((data as any[]) || []).map((t) => ({
          id: t.id,
          title: t.title,
          linked: t.client_id === clientId,
          ownedByMe: t.user_id === user?.id,
          hint: t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : null,
        }));
      }
      if (kind === "projects") {
        const { data } = await supabase
          .from("task_groups")
          .select("id, name, client_id, project_type")
          .not("project_type", "in", "(protocol,crm_client)")
          .order("name")
          .limit(500);
        return ((data as any[]) || []).map((g) => ({
          id: g.id,
          title: g.name,
          linked: g.client_id === clientId,
          hint: g.client_id && g.client_id !== clientId ? "у др. клиента" : null,
        }));
      }
      // protocols
      const { data } = await supabase
        .from("task_groups")
        .select("id, name, protocol_meta")
        .eq("project_type", "protocol" as any)
        .order("created_at", { ascending: false })
        .limit(500);
      return ((data as any[]) || []).map((g) => ({
        id: g.id,
        title: g.name,
        linked: (g.protocol_meta as any)?.client_id === clientId,
        meta: g.protocol_meta ?? {},
      }));
    },
    enabled: open && !!clientId,
    staleTime: 1000 * 15,
  });

  const initialLinked = useMemo(
    () => new Set(rows.filter((r) => r.linked).map((r) => r.id)),
    [rows],
  );

  const [syncedKey, setSyncedKey] = useState("");
  const syncKey = `${open}-${rows.length}`;
  if (open && syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setSelected(new Set(initialLinked));
  }

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (onlyLinked && !initialLinked.has(r.id)) return false;
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, onlyLinked, q, initialLinked]);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = useMutation({
    mutationFn: async () => {
      const toLink = [...selected].filter((id) => !initialLinked.has(id));
      const toUnlink = [...initialLinked].filter((id) => !selected.has(id));

      if (kind === "tasks") {
        if (toLink.length) {
          const { error } = await supabase.from("tasks").update({ client_id: clientId }).in("id", toLink);
          if (error) throw error;
        }
        if (toUnlink.length) {
          const { error } = await supabase.from("tasks").update({ client_id: null }).in("id", toUnlink);
          if (error) throw error;
        }
      } else if (kind === "projects") {
        if (toLink.length) {
          const { error } = await supabase.from("task_groups").update({ client_id: clientId } as any).in("id", toLink);
          if (error) throw error;
        }
        if (toUnlink.length) {
          const { error } = await supabase.from("task_groups").update({ client_id: null } as any).in("id", toUnlink);
          if (error) throw error;
        }
      } else {
        // protocols: merge protocol_meta.client_id per row
        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const id of toLink) {
          const meta = { ...(byId.get(id)?.meta ?? {}), client_id: clientId };
          const { error } = await supabase.from("task_groups").update({ protocol_meta: meta } as any).eq("id", id);
          if (error) throw error;
        }
        for (const id of toUnlink) {
          const meta = { ...(byId.get(id)?.meta ?? {}) };
          delete meta.client_id;
          const { error } = await supabase.from("task_groups").update({ protocol_meta: meta } as any).eq("id", id);
          if (error) throw error;
        }
      }
      return { linked: toLink.length, unlinked: toUnlink.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["client_room_tasks", clientId] });
      qc.invalidateQueries({ queryKey: ["client_task_threads", clientId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      const parts: string[] = [];
      if (r.linked) parts.push(`привязано: ${r.linked}`);
      if (r.unlinked) parts.push(`отвязано: ${r.unlinked}`);
      toast.success(parts.length ? parts.join(", ") : "Без изменений");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changes =
    [...selected].filter((id) => !initialLinked.has(id)).length +
    [...initialLinked].filter((id) => !selected.has(id)).length;

  const emptyText =
    kind === "projects" ? "Проекты не найдены"
      : kind === "protocols" ? "Протоколы не найдены"
      : "Задачи не найдены";

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию…"
          className="h-9 pl-8"
          autoFocus
        />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setOnlyLinked(false)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            !onlyLinked ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Все
        </button>
        <button
          onClick={() => setOnlyLinked(true)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            onlyLinked ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Привязанные
        </button>
      </div>

      <ScrollArea className="h-72 rounded-lg border border-border">
        {isLoading ? (
          <div className="flex h-72 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-72 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map((r) => {
              const checked = selected.has(r.id);
              const wasLinked = initialLinked.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                  {wasLinked && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      привязан
                    </span>
                  )}
                  {r.hint && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{r.hint}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
        <span className="text-xs text-muted-foreground">
          {changes ? `Изменений: ${changes}` : "Выберите элементы"}
        </span>
        <Button onClick={() => save.mutate()} disabled={!changes || save.isPending} size="sm">
          {save.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-1.5 h-4 w-4" />
          )}
          Сохранить
        </Button>
      </DialogFooter>
    </>
  );
}