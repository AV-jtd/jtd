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
import { Search, Loader2, Link2 } from "lucide-react";

type Scope = "unlinked" | "mine" | "all";

type TaskRow = {
  id: string;
  title: string;
  client_id: string | null;
  user_id: string;
  is_completed: boolean;
  group_id: string | null;
  deadline: string | null;
};

/**
 * Массовая привязка существующих задач к клиенту прямо из комнаты клиента.
 * Источник истины — `tasks.client_id` (без новых сущностей). Уже привязанные
 * к этому клиенту задачи показаны отмеченными; снятие галочки = отвязка.
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
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("unlinked");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["bulk_link_tasks", clientId, open],
    queryFn: async (): Promise<TaskRow[]> => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, client_id, user_id, is_completed, group_id, deadline")
        .eq("is_completed", false)
        .order("created_at", { ascending: false })
        .limit(500);
      return ((data as any[]) || []) as TaskRow[];
    },
    enabled: open && !!clientId,
    staleTime: 1000 * 15,
  });

  // Изначально отмечаем задачи, уже привязанные к этому клиенту.
  const initialLinked = useMemo(
    () => new Set(tasks.filter((t) => t.client_id === clientId).map((t) => t.id)),
    [tasks, clientId],
  );

  // Синхронизируем выбор с актуальными данными при открытии/загрузке.
  const [syncedKey, setSyncedKey] = useState("");
  const key = `${open}-${tasks.length}`;
  if (open && key !== syncedKey && tasks.length >= 0) {
    setSyncedKey(key);
    setSelected(new Set(initialLinked));
  }

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (scope === "unlinked" && t.client_id && t.client_id !== clientId) return false;
      if (scope === "unlinked" && !t.client_id) { /* ok */ }
      if (scope === "mine" && t.user_id !== user?.id) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, scope, q, user?.id, clientId]);

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
      if (toLink.length) {
        const { error } = await supabase.from("tasks").update({ client_id: clientId }).in("id", toLink);
        if (error) throw error;
      }
      if (toUnlink.length) {
        const { error } = await supabase.from("tasks").update({ client_id: null }).in("id", toUnlink);
        if (error) throw error;
      }
      return { linked: toLink.length, unlinked: toUnlink.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["client_room_tasks", clientId] });
      qc.invalidateQueries({ queryKey: ["client_task_threads", clientId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      const parts = [];
      if (r.linked) parts.push(`привязано: ${r.linked}`);
      if (r.unlinked) parts.push(`отвязано: ${r.unlinked}`);
      toast.success(parts.length ? parts.join(", ") : "Без изменений");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changes =
    [...selected].filter((id) => !initialLinked.has(id)).length +
    [...initialLinked].filter((id) => !selected.has(id)).length;

  const SCOPES: { key: Scope; label: string }[] = [
    { key: "unlinked", label: "Без клиента" },
    { key: "mine", label: "Мои" },
    { key: "all", label: "Все" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">
            Привязать задачи к «{clientName}»
          </DialogTitle>
        </DialogHeader>

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
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                scope === s.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <ScrollArea className="h-72 rounded-lg border border-border">
          {isLoading ? (
            <div className="flex h-72 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-72 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Нет задач по выбранному фильтру
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visible.map((t) => {
                const checked = selected.has(t.id);
                const wasLinked = initialLinked.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    {wasLinked && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        привязана
                      </span>
                    )}
                    {t.deadline && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(t.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {changes ? `Изменений: ${changes}` : "Выберите задачи"}
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
      </DialogContent>
    </Dialog>
  );
}