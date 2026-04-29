import { useState, useEffect, useRef, useMemo } from "react";
import { useThreads, useThreadsRealtime, Thread } from "@/hooks/useMessenger";
import { useAvailableUsers } from "@/hooks/useTasks";
import ProjectChat from "./ProjectChat";
import TaskChat from "./TaskChat";
import AiChatThread from "./AiChatThread";
import type { ModuleContext } from "@/components/AiAssistant";
import { X, MessageCircle, ArrowLeft, CheckSquare, FolderOpen, Search, Sparkles, Minimize2, User as UserIcon } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatMessagePreview } from "@/lib/systemMessages";

interface MessengerPanelProps {
  onClose: () => void;
  /**
   * Optional "minimize" handler. When provided, an extra button appears in
   * the active-thread header that lets the user hide the messenger panel
   * without clearing the active thread, so they can inspect a task and come
   * back to the same conversation in one click.
   */
  onMinimize?: () => void;
  markThreadRead?: (threadId: string) => void;
  isThreadUnread?: (threadId: string, lastMessageAt: string | null, lastMessageUserId?: string | null) => boolean;
  onNavigateToProject?: (groupId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  /**
   * Open the project detail panel as an overlay on top of the messenger
   * without closing it. When provided, the in-thread "open project" header
   * button calls this instead of `onNavigateToProject` so the user keeps
   * their place in the thread list.
   */
  onOpenProjectDetail?: (groupId: string) => void;
  /**
   * Module context propagated to the pinned AI assistant entry, so opening it
   * from the messenger lands in the same module/project scope as the global
   * AI Sheet (`AiAssistant`) opened from the header.
   */
  moduleContext?: ModuleContext;
  /**
   * Optional thread id to restore on mount. Lets the parent preserve the
   * "active conversation" across messenger close/reopen cycles (e.g. when the
   * user navigates to a task on mobile, which collapses the panel).
   */
  initialActiveThreadId?: string | null;
  /** Notifies the parent whenever the active thread changes (or is cleared). */
  onActiveThreadChange?: (threadId: string | null) => void;
}

function formatThreadDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Вчера";
  return format(d, "d MMM", { locale: ru });
}

export default function MessengerPanel({
  onClose,
  onMinimize,
  markThreadRead,
  isThreadUnread,
  onNavigateToProject,
  onNavigateToTask,
  onOpenProjectDetail,
  moduleContext,
  initialActiveThreadId,
  onActiveThreadChange,
}: MessengerPanelProps) {
  const { data: threads = [], isLoading } = useThreads();
  // Live updates: refresh the thread list when new messages/comments arrive
  // anywhere, without waiting for `staleTime`.
  useThreadsRealtime();
  const { data: availableUsers = [] } = useAvailableUsers();
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const [search, setSearch] = useState("");
  // Multi-select filters over the thread list. Empty array = no filter.
  // - authorIds: filter by `lastMessageUserId` (last message author).
  // - projectIds: filter by `groupId` (works for both project-chat threads
  //   and task threads, since task threads also carry `groupId`).
  const [authorIds, setAuthorIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  // Restore the active thread when the parent provides a remembered id and
  // the matching thread is available in the loaded list. Runs once per
  // (id, threads) change so manual selection still wins.
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialActiveThreadId) return;
    if (restoredRef.current === initialActiveThreadId) return;
    if (activeThread?.id === initialActiveThreadId) {
      restoredRef.current = initialActiveThreadId;
      return;
    }
    const match = threads.find(t => t.id === initialActiveThreadId);
    if (match) {
      setActiveThread(match);
      restoredRef.current = initialActiveThreadId;
    }
  }, [initialActiveThreadId, threads, activeThread?.id]);

  const handleOpenThread = (thread: Thread) => {
    // Always switch to the freshly clicked thread, even if another one is
    // already active. Using a functional updater guarantees the new value is
    // applied even when several clicks land in the same React batch.
    setActiveThread(() => thread);
    onActiveThreadChange?.(thread.id);
    markThreadRead?.(thread.id);
  };

  const clearActiveThread = () => {
    setActiveThread(null);
    restoredRef.current = null;
    onActiveThreadChange?.(null);
  };

  // Build distinct author / project options from currently loaded threads.
  // Memoized so re-opening filter popovers doesn't re-scan on every keystroke.
  const authorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of threads) {
      if (t.lastMessageUserId && t.lastMessageAuthor) {
        map.set(t.lastMessageUserId, t.lastMessageAuthor);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [threads]);

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of threads) {
      // Project chat: groupId === thread.id. Task chat: groupId set if known.
      const id = t.groupId;
      const name = t.type === "group" ? t.name : t.groupName;
      if (id && name) map.set(id, name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [threads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter(t => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (authorIds.length && (!t.lastMessageUserId || !authorIds.includes(t.lastMessageUserId))) return false;
      if (projectIds.length && (!t.groupId || !projectIds.includes(t.groupId))) return false;
      return true;
    });
  }, [threads, search, authorIds, projectIds]);

  const activeFilterCount = authorIds.length + projectIds.length;
  const clearAllFilters = () => { setAuthorIds([]); setProjectIds([]); };
  const toggleId = (set: string[], setSet: (v: string[]) => void, id: string) =>
    setSet(set.includes(id) ? set.filter(x => x !== id) : [...set, id]);

  // Human-readable subtitle for the AI entry, mirroring AiAssistant's labels.
  const moduleLabel = (() => {
    switch (moduleContext?.module) {
      case "pmo": return "PMO";
      case "npd": return "NPD";
      case "crm": return "CRM";
      default: return null;
    }
  })();
  const aiTitle = moduleLabel ? `ИИ · ${moduleLabel}` : "ИИ-ассистент";
  const aiSubtitle = moduleContext?.activeProjectName
    ? `Контекст: ${moduleContext.activeProjectName}`
    : moduleLabel
      ? `${moduleLabel}-аналитика по портфелю`
      : "Обзор проектов, приоритеты, аналитика";

  // AI Chat view
  if (showAiChat) {
    return (
      <div className="flex flex-col h-full bg-card border-l border-border">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setShowAiChat(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 truncate">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">{aiTitle}</span>
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{aiSubtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <AiChatThread mode="assistant" moduleContext={moduleContext} />
        </div>
      </div>
    );
  }

  // Thread list view
  if (!activeThread) {
    return (
      <div className="flex flex-col h-full bg-card border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Сообщения</span>
            {threads.length > 0 && (
              <span className="text-xs text-muted-foreground">({threads.length})</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="h-8 text-sm pl-8"
            />
          </div>
          {/* Filter chips: by author / by project. Multi-select via popovers. */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <FilterChip
              icon={<UserIcon className="h-3 w-3" />}
              label="Автор"
              count={authorIds.length}
              options={authorOptions}
              selected={authorIds}
              onToggle={(id) => toggleId(authorIds, setAuthorIds, id)}
              onClear={() => setAuthorIds([])}
              emptyHint="Нет авторов"
            />
            <FilterChip
              icon={<FolderOpen className="h-3 w-3" />}
              label="Проект"
              count={projectIds.length}
              options={projectOptions}
              selected={projectIds}
              onToggle={(id) => toggleId(projectIds, setProjectIds, id)}
              onClear={() => setProjectIds([])}
              emptyHint="Нет проектов"
            />
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* AI Assistant entry */}
        <div className="px-3 py-2 border-b border-border">
          <button
            onClick={() => setShowAiChat(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground block truncate">{aiTitle}</span>
              <p className="text-[10px] text-muted-foreground truncate">{aiSubtitle}</p>
            </div>
          </button>
        </div>

        {/* Thread list */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Ничего не найдено" : "Нет активных обсуждений"}
              </p>
            </div>
          ) : (
            <div className="py-1">
              {filtered.map(thread => {
                const unread = isThreadUnread?.(thread.id, thread.lastMessageAt, thread.lastMessageUserId) ?? false;
                const isProject = thread.type === "group";
                const projectColor = isProject ? thread.groupColor || null : null;
                const projectEmoji = isProject
                  ? (thread.groupIcon && thread.groupIcon !== "list" ? thread.groupIcon : "📁")
                  : null;
                return (
                  <button
                    key={thread.id}
                    onClick={() => handleOpenThread(thread)}
                    className={cn(
                      "relative w-full flex items-start gap-3 px-4 py-3 transition-colors text-left",
                      isProject
                        ? "bg-primary/[0.04] hover:bg-primary/10 pl-[15px]"
                        : "hover:bg-muted/50",
                    )}
                    style={isProject && projectColor ? { boxShadow: `inset 3px 0 0 0 ${projectColor}` } : undefined}
                  >
                    <div className="relative">
                      {isProject ? (
                        thread.groupLogoUrl ? (
                          <img
                            src={thread.groupLogoUrl}
                            alt=""
                            className="h-9 w-9 rounded-xl object-cover shrink-0 mt-0.5 ring-1 ring-border"
                          />
                        ) : (
                          <div
                            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-base ring-1 ring-border/40"
                            style={projectColor ? { backgroundColor: `${projectColor}26` } : { backgroundColor: "hsl(var(--primary) / 0.12)" }}
                          >
                            <span className="leading-none">{projectEmoji}</span>
                          </div>
                        )
                      ) : (
                        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-accent">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {unread && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn(
                          "text-sm truncate",
                          unread ? "font-bold text-foreground" : isProject ? "font-semibold text-foreground" : "font-medium text-foreground"
                        )}>
                          {thread.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatThreadDate(thread.lastMessageAt)}
                        </span>
                      </div>
                      {isProject ? (
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 truncate">Чат проекта</p>
                      ) : thread.groupName ? (
                        <p className="text-[10px] text-muted-foreground/60 truncate">{thread.groupName}</p>
                      ) : null}
                      {thread.lastMessage && (
                        <p className={cn("text-xs truncate mt-0.5", unread ? "text-foreground/80 font-medium" : "text-muted-foreground")}>
                          {thread.lastMessageAuthor && (
                            <span className="font-medium text-foreground/60">{thread.lastMessageAuthor}: </span>
                          )}
                          {formatMessagePreview(thread.lastMessage)}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] rounded-full px-1.5 py-0.5 shrink-0 mt-1",
                      unread ? "bg-destructive text-destructive-foreground font-bold" : "text-muted-foreground bg-muted"
                    )}>
                      {thread.messageCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // Active thread view
  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Back header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={clearActiveThread}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="К списку чатов"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (activeThread.type === "group" && activeThread.groupId && onNavigateToProject) {
              if (onOpenProjectDetail) {
                // Overlay mode: keep messenger open, just show the detail panel above it.
                onOpenProjectDetail(activeThread.groupId);
              } else {
                onNavigateToProject(activeThread.groupId);
                onClose();
              }
            } else if (activeThread.type === "task" && activeThread.taskId && onNavigateToTask) {
              onNavigateToTask(activeThread.taskId);
            }
          }}
          disabled={
            (activeThread.type === "group" && !onNavigateToProject) ||
            (activeThread.type === "task" && !onNavigateToTask)
          }
          className={cn(
            "flex-1 min-w-0 text-left",
            ((activeThread.type === "group" && onNavigateToProject) || (activeThread.type === "task" && onNavigateToTask)) && "hover:opacity-70 transition-opacity cursor-pointer"
          )}
          title={activeThread.type === "group" ? "Открыть проект" : "Перейти к задаче"}
        >
          <p className="text-sm font-semibold text-foreground truncate">{activeThread.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {activeThread.type === "group" ? "Чат проекта" : "Чат задачи"}
            {activeThread.groupName ? ` · ${activeThread.groupName}` : ""}
          </p>
        </button>
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Свернуть чат (тред сохранится)"
            aria-label="Свернуть чат"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chat content */}
      <div className="flex-1 overflow-hidden">
        {activeThread.type === "group" && activeThread.groupId ? (
          <ProjectChat
            groupId={activeThread.groupId}
            groupName={activeThread.name}
            onClose={clearActiveThread}
            embedded
            onNavigateToProject={(gId) => {
              if (onOpenProjectDetail) {
                onOpenProjectDetail(gId);
              } else {
                onNavigateToProject?.(gId);
                onClose();
              }
            }}
            onNavigateToTask={(tId) => {
              if (onNavigateToTask) {
                onNavigateToTask(tId);
                onClose();
              }
            }}
          />
        ) : activeThread.type === "task" && activeThread.taskId ? (
          <TaskChat
            taskId={activeThread.taskId}
            taskTitle={activeThread.name}
            availableUsers={availableUsers}
            variant="full"
            onNavigateToTask={(tId) => {
              if (onNavigateToTask) {
                onNavigateToTask(tId);
                onClose();
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact filter chip that opens a popover with multi-select checkboxes.
 * Active state shows a count badge; clearing happens via the trash button.
 */
function FilterChip({
  icon,
  label,
  count,
  options,
  selected,
  onToggle,
  onClear,
  emptyHint,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  emptyHint: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border transition-colors",
            count > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {icon}
          <span>{label}</span>
          {count > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1">
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-foreground">{label}</span>
          {count > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Очистить
            </button>
          )}
        </div>
        <ScrollArea className="max-h-64">
          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{emptyHint}</p>
          ) : (
            <div className="py-1">
              {options.map(opt => {
                const checked = selected.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onToggle(opt.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="text-xs text-foreground truncate flex-1">{opt.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
