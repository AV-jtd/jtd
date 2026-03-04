import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { List, FolderOpen, Users, Tag, CheckCircle2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToProject?: (groupId: string) => void;
  onNavigateToTag?: (tagId: string) => void;
}

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

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: results } = useQuery({
    queryKey: ["global-search", query, user?.id],
    queryFn: async () => {
      if (!user || !query.trim()) return { tasks: [], groups: [], clients: [], tags: [] };
      const q = query.trim().toLowerCase();

      const [tasksRes, groupsRes, clientsRes, tagsRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id, title, is_completed, group_id, assigned_to")
          .ilike("title", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(8),
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
      ]);

      return {
        tasks: tasksRes.data || [],
        groups: groupsRes.data || [],
        clients: clientsRes.data || [],
        tags: tagsRes.data || [],
      };
    },
    enabled: !!user && open && query.trim().length > 0,
    staleTime: 1000,
  });

  const hasResults =
    (results?.tasks?.length || 0) +
    (results?.groups?.length || 0) +
    (results?.clients?.length || 0) +
    (results?.tags?.length || 0) > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Поиск задач, проектов, клиентов, тегов..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Начните вводить для поиска
          </div>
        ) : !hasResults ? (
          <CommandEmpty>Ничего не найдено</CommandEmpty>
        ) : (
          <>
            {(results?.tasks?.length || 0) > 0 && (
              <CommandGroup heading="Задачи">
                {results!.tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={`task-${task.id}`}
                    onSelect={() => {
                      onOpenChange(false);
                      onNavigateToTask?.(task.id);
                    }}
                    className="flex items-center gap-2"
                  >
                    {task.is_completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <List className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={cn("truncate", task.is_completed && "line-through text-muted-foreground")}>
                      {task.title}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(results?.groups?.length || 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Проекты">
                  {results!.groups.map((g) => (
                    <CommandItem
                      key={g.id}
                      value={`group-${g.id}`}
                      onSelect={() => {
                        onOpenChange(false);
                        onNavigateToProject?.(g.id);
                      }}
                      className="flex items-center gap-2"
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" style={{ color: g.color || undefined }} />
                      <span className="truncate">{g.icon ? `${g.icon} ` : ""}{g.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {(results?.clients?.length || 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Клиенты">
                  {results!.clients.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`client-${c.id}`}
                      onSelect={() => {
                        onOpenChange(false);
                        navigate("/crm");
                      }}
                      className="flex items-center gap-2"
                    >
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{c.name}</span>
                      {c.contact_name && (
                        <span className="text-xs text-muted-foreground truncate">· {c.contact_name}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {(results?.tags?.length || 0) > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Теги">
                  {results!.tags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={`tag-${tag.id}`}
                      onSelect={() => {
                        onOpenChange(false);
                        onNavigateToTag?.(tag.id);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Tag className="h-4 w-4 shrink-0" style={{ color: tag.color || undefined }} />
                      <span className="truncate">{tag.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
