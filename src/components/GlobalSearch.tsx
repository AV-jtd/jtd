import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { List, FolderOpen, Users, Tag, CheckCircle2, Search, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToProject?: (groupId: string) => void;
  onNavigateToTag?: (tagId: string) => void;
}

type TaskResult = {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  group_id: string | null;
  matchType: "title" | "description" | "subtask";
  subtaskMatch?: string;
};

export default function GlobalSearch({
  open,
  onOpenChange,
  onNavigateToTask,
  onNavigateToProject,
  onNavigateToTag,
}: GlobalSearchProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const { data: results } = useQuery({
    queryKey: ["global-search", query, user?.id],
    queryFn: async () => {
      if (!user || !query.trim()) return { tasks: [], groups: [], clients: [], tags: [] };
      const q = query.trim();

      // Search tasks by title OR description
      const [titleRes, descRes, groupsRes, clientsRes, tagsRes, subtasksRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, description, is_completed, group_id")
          .ilike("title", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("tasks")
          .select("id, title, description, is_completed, group_id")
          .not("description", "is", null)
          .ilike("description", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("task_groups")
          .select("id, name, icon, color")
          .ilike("name", `%${q}%`)
          .limit(5),
        supabase
          .from("clients")
          .select("id, name, contact_name")
          .ilike("name", `%${q}%`)
          .limit(5),
        supabase
          .from("tags")
          .select("id, name, color")
          .ilike("name", `%${q}%`)
          .limit(5),
        supabase
          .from("subtasks")
          .select("id, title, task_id")
          .ilike("title", `%${q}%`)
          .limit(6),
      ]);

      // Merge task results, dedup by id
      const taskMap = new Map<string, TaskResult>();

      for (const t of titleRes.data || []) {
        taskMap.set(t.id, { ...t, matchType: "title" });
      }
      for (const t of descRes.data || []) {
        if (!taskMap.has(t.id)) {
          taskMap.set(t.id, { ...t, matchType: "description" });
        }
      }

      // Subtask matches — load parent tasks
      const subtaskRows = subtasksRes.data || [];
      if (subtaskRows.length > 0) {
        const parentIds = [...new Set(subtaskRows.map(s => s.task_id))].filter(id => !taskMap.has(id));
        if (parentIds.length > 0) {
          const { data: parentTasks } = await supabase
            .from("tasks")
            .select("id, title, description, is_completed, group_id")
            .in("id", parentIds);
          for (const t of parentTasks || []) {
            const matchingSub = subtaskRows.find(s => s.task_id === t.id);
            taskMap.set(t.id, { ...t, matchType: "subtask", subtaskMatch: matchingSub?.title });
          }
        }
        // Also annotate already-found tasks with subtask info
        for (const s of subtaskRows) {
          const existing = taskMap.get(s.task_id);
          if (existing && existing.matchType !== "title") {
            existing.matchType = "subtask";
            existing.subtaskMatch = s.title;
          }
        }
      }

      return {
        tasks: [...taskMap.values()].slice(0, 10),
        groups: groupsRes.data || [],
        clients: clientsRes.data || [],
        tags: tagsRes.data || [],
      };
    },
    enabled: !!user && open && query.trim().length > 0,
    staleTime: 1000,
  });

  // Flatten results for keyboard navigation
  const allItems: { type: string; id: string; data: any }[] = [];
  if (results) {
    for (const t of results.tasks) allItems.push({ type: "task", id: t.id, data: t });
    for (const g of results.groups) allItems.push({ type: "group", id: g.id, data: g });
    for (const c of results.clients) allItems.push({ type: "client", id: c.id, data: c });
    for (const t of results.tags) allItems.push({ type: "tag", id: t.id, data: t });
  }

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && allItems.length > 0) {
        e.preventDefault();
        handleSelect(allItems[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, allItems.length, selectedIndex]);

  const handleSelect = (item: { type: string; id: string; data: any }) => {
    onOpenChange(false);
    if (item.type === "task") onNavigateToTask?.(item.id);
    else if (item.type === "group") onNavigateToProject?.(item.id);
    else if (item.type === "client") navigate("/crm");
    else if (item.type === "tag") onNavigateToTag?.(item.id);
  };

  const hasResults = allItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground mr-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск задач, проектов, клиентов, тегов..."
            className="flex-1 h-12 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground p-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="ml-2 hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <ScrollArea className="max-h-[360px]">
          {query.trim().length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Начните вводить для поиска</p>
              <p className="text-xs mt-1 opacity-60">Поиск по названиям, описаниям и подзадачам</p>
            </div>
          ) : !hasResults ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Ничего не найдено по «{query}»
            </div>
          ) : (
            <div className="p-1">
              {results!.tasks.length > 0 && (
                <div>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Задачи</p>
                  {results!.tasks.map((task) => {
                    const idx = allItems.findIndex(i => i.type === "task" && i.id === task.id);
                    return (
                      <button
                        key={task.id}
                        onClick={() => handleSelect({ type: "task", id: task.id, data: task })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm transition-colors text-left",
                          idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        )}
                      >
                        {task.is_completed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : (
                          <List className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className={cn("truncate block", task.is_completed && "line-through text-muted-foreground")}>
                            {task.title}
                          </span>
                          {task.matchType === "description" && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <FileText className="h-3 w-3" /> совпадение в описании
                            </span>
                          )}
                          {task.matchType === "subtask" && task.subtaskMatch && (
                            <span className="text-xs text-muted-foreground mt-0.5 truncate block">
                              ↳ {task.subtaskMatch}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {results!.groups.length > 0 && (
                <div>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-1">Проекты</p>
                  {results!.groups.map((g) => {
                    const idx = allItems.findIndex(i => i.type === "group" && i.id === g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => handleSelect({ type: "group", id: g.id, data: g })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm transition-colors",
                          idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        )}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0" style={{ color: g.color || undefined }} />
                        <span className="truncate">{g.icon ? `${g.icon} ` : ""}{g.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {results!.clients.length > 0 && (
                <div>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-1">Клиенты</p>
                  {results!.clients.map((c) => {
                    const idx = allItems.findIndex(i => i.type === "client" && i.id === c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelect({ type: "client", id: c.id, data: c })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm transition-colors",
                          idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        )}
                      >
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.name}</span>
                        {c.contact_name && (
                          <span className="text-xs text-muted-foreground truncate">· {c.contact_name}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {results!.tags.length > 0 && (
                <div>
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground mt-1">Теги</p>
                  {results!.tags.map((tag) => {
                    const idx = allItems.findIndex(i => i.type === "tag" && i.id === tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => handleSelect({ type: "tag", id: tag.id, data: tag })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm transition-colors",
                          idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        )}
                      >
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        <span className="truncate">{tag.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer hint */}
        <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd>
            навигация
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd>
            выбрать
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">esc</kbd>
            закрыть
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
