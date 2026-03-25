import { memo, useEffect, useState } from "react";
import { Clock, Layers, Search, Star, User, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { cn } from "@/lib/utils";
import type { Profile, TaskGroup } from "@/hooks/useTasks";

interface TaskFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  priorityFilter: number | "important" | "overdue" | null;
  onPriorityFilterChange: React.Dispatch<React.SetStateAction<number | "important" | "overdue" | null>>;
  assigneeFilter: string | null;
  onAssigneeFilterChange: React.Dispatch<React.SetStateAction<string | null>>;
  projectFilter: string | null;
  onProjectFilterChange: React.Dispatch<React.SetStateAction<string | null>>;
  availableUsers: Profile[];
  groups: TaskGroup[];
  currentUserId?: string;
  activeView: string;
}

function TaskFiltersBar({
  searchValue,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  projectFilter,
  onProjectFilterChange,
  availableUsers,
  groups,
  currentUserId,
  activeView,
}: TaskFiltersBarProps) {
  const [draftSearch, setDraftSearch] = useState(searchValue);

  useEffect(() => {
    setDraftSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draftSearch !== searchValue) {
        onSearchChange(draftSearch);
      }
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [draftSearch, onSearchChange, searchValue]);

  const hasActiveFilters = priorityFilter !== null || assigneeFilter !== null || projectFilter !== null;

  return (
    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Поиск..."
          className="h-7 w-32 focus:w-44 transition-all pl-7 pr-6 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {draftSearch && (
          <button
            onClick={() => {
              setDraftSearch("");
              onSearchChange("");
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {[
        { value: "overdue" as number | "important" | "overdue", label: "Просроченные", color: "text-red-500 border-red-500/40 bg-red-500/10", icon: "clock" },
        { value: "important" as number | "important" | "overdue", label: "", color: "text-amber-500 border-amber-500/40 bg-amber-500/10", icon: "star" },
      ].map((priority) => (
        <button
          key={String(priority.value)}
          onClick={() => onPriorityFilterChange((prev) => (prev === priority.value ? null : priority.value))}
          className={cn(
            "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1",
            priorityFilter === priority.value
              ? priority.color
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
          )}
        >
          {priority.icon === "star" ? <Star className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {priority.label}
        </button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1",
              assigneeFilter !== null
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            )}
          >
            <User className="h-3 w-3" />
            {assigneeFilter === null
              ? "Ответственный"
              : assigneeFilter === "me"
                ? "Мои"
                : assigneeFilter === "unassigned"
                  ? "Без ответственного"
                  : availableUsers.find((user) => user.id === assigneeFilter)?.display_name || "Пользователь"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="bottom" align="start">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Ответственный</p>
          <button
            onClick={() => onAssigneeFilterChange((prev) => (prev === "me" ? null : "me"))}
            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors", assigneeFilter === "me" && "bg-primary/10 text-primary")}
          >
            Назначены мне
          </button>
          <button
            onClick={() => onAssigneeFilterChange((prev) => (prev === "unassigned" ? null : "unassigned"))}
            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors", assigneeFilter === "unassigned" && "bg-primary/10 text-primary")}
          >
            Без ответственного
          </button>
          <PopoverSearchList
            items={availableUsers.filter((user) => user.id !== currentUserId)}
            searchKey={(user) => user.display_name || user.email || ""}
            placeholder="Найти..."
            renderItem={(user) => (
              <button
                key={user.id}
                onClick={() => onAssigneeFilterChange((prev) => (prev === user.id ? null : user.id))}
                className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors truncate", assigneeFilter === user.id && "bg-primary/10 text-primary")}
              >
                {user.display_name || user.email || "—"}
              </button>
            )}
          />
        </PopoverContent>
      </Popover>

      {activeView !== "group" && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1",
                projectFilter !== null
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              )}
            >
              <Layers className="h-3 w-3" />
              {projectFilter === null
                ? "Проект"
                : projectFilter === "none"
                  ? "Без проекта"
                  : groups.find((group) => group.id === projectFilter)?.name || "Проект"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="bottom" align="start">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Проект</p>
            <button
              onClick={() => onProjectFilterChange((prev) => (prev === "none" ? null : "none"))}
              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground", projectFilter === "none" && "bg-primary/10 text-primary")}
            >
              Без проекта
            </button>
            <PopoverSearchList
              items={groups}
              searchKey={(group) => group.name}
              placeholder="Найти проект..."
              renderItem={(group) => (
                <button
                  key={group.id}
                  onClick={() => onProjectFilterChange((prev) => (prev === group.id ? null : group.id))}
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors truncate", projectFilter === group.id && "bg-primary/10 text-primary")}
                >
                  {group.name}
                </button>
              )}
            />
          </PopoverContent>
        </Popover>
      )}

      {hasActiveFilters && (
        <button
          onClick={() => {
            onPriorityFilterChange(null);
            onAssigneeFilterChange(null);
            onProjectFilterChange(null);
          }}
          className="text-xs px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Сбросить
        </button>
      )}
    </div>
  );
}

export default memo(TaskFiltersBar);
