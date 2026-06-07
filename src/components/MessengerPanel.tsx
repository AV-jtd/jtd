import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useThreads, useThreadsRealtime, Thread, ThreadKindFilter } from "@/hooks/useMessenger";
import { useAvailableUsers } from "@/hooks/useTasks";
import { useMessageSearch, type MessageSearchResult } from "@/hooks/useMessageSearch";
import ChatAvatar from "./chat/ChatAvatar";
import ProjectRoomCenter from "./chat/ProjectRoomCenter";
import TaskChat from "./TaskChat";
import AiChatThread from "./AiChatThread";
import type { ModuleContext } from "@/components/AiAssistant";
import { X, MessageCircle, ArrowLeft, CheckSquare, FolderOpen, Search, Sparkles, Minimize2, Maximize2, User as UserIcon, MailWarning } from "lucide-react";
import { format, isToday, isYesterday, parseISO, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatMessagePreview } from "@/lib/systemMessages";
import ClosedTaskPill from "./ClosedTaskPill";
import TaskClientPicker from "./TaskClientPicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const navigate = useNavigate();
  const [kindFilter, setKindFilter] = useState<ThreadKindFilter>("chat");
  const { data: threads = [], isLoading } = useThreads(kindFilter);
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
  // Быстрый фильтр «только непрочитанные».
  const [unreadOnly, setUnreadOnly] = useState(false);

  // In-memory scroll position cache per thread, keyed by "group:<id>" /
  // "task:<id>". Kept in a ref (not localStorage) so it survives messenger
  // open/close cycles within the session but resets on a full page reload.
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollWrite = useRef(0);

  const activeThreadKey =
    activeThread?.type === "group" && activeThread.groupId
      ? `group:${activeThread.groupId}`
      : activeThread?.type === "task" && activeThread.taskId
        ? `task:${activeThread.taskId}`
        : null;

  // Throttled scroll writer (~every 200ms) — stores scrollTop for the active thread.
  const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!activeThreadKey) return;
    const now = Date.now();
    if (now - lastScrollWrite.current < 200) return;
    lastScrollWrite.current = now;
    scrollPositions.current.set(activeThreadKey, e.currentTarget.scrollTop);
  };

  // After the active thread changes (or the panel mounts with one), restore the
  // saved scrollTop. If none was stored yet, jump to the bottom.
  useLayoutEffect(() => {
    if (!activeThreadKey) return;
    const msgs = scrollContainerRef.current;
    if (!msgs) return;
    const stored = scrollPositions.current.get(activeThreadKey);
    if (stored != null) {
      msgs.scrollTop = stored;
    } else {
      msgs.scrollTop = msgs.scrollHeight;
    }
  }, [activeThreadKey]);

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

  // Подхватываем свежие данные активного треда (например, taskCompleted
  // после закрытия задачи прямо из чата). Без этого шапка треда показывала
  // бы устаревший snapshot до повторного открытия панели.
  useEffect(() => {
    if (!activeThread) return;
    const fresh = threads.find(t => t.id === activeThread.id);
    if (!fresh) return;
    // Сравнение по ключевым полям, чтобы не дёргать setState на ровном месте.
    if (
      fresh.taskCompleted !== activeThread.taskCompleted ||
      fresh.name !== activeThread.name ||
      fresh.lastMessageAt !== activeThread.lastMessageAt
    ) {
      setActiveThread(fresh);
    }
  }, [threads, activeThread]);

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

  // CRM-контекст активного треда-задачи: нужен, чтобы прямо в шапке чата
  // CRM-задачи (task_type='crm' / проект «Новые клиенты») показать кнопку
  // привязки к клиенту. Делит кэш с TaskChat по ключу ["task-crm-context", id].
  const qc = useQueryClient();
  const activeTaskId = activeThread?.type === "task" ? activeThread.taskId ?? null : null;
  const { data: crmContext } = useQuery({
    queryKey: ["task-crm-context", activeTaskId],
    enabled: !!activeTaskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("client_id, task_type, group:task_groups(project_type, name)")
        .eq("id", activeTaskId)
        .maybeSingle();
      if (error) throw error;
      const group = (data as any)?.group ?? null;
      const groupName = (group?.name ?? "").trim().toLowerCase();
      const isCrm =
        (data as any)?.task_type === "crm" ||
        group?.project_type === "crm" ||
        groupName.includes("новые клиенты");
      return { clientId: (data as any)?.client_id ?? null, isCrm };
    },
  });
  const handleLinkClient = async (clientId: string | null) => {
    if (!activeTaskId) return;
    const { error } = await supabase
      .from("tasks")
      .update({ client_id: clientId })
      .eq("id", activeTaskId);
    if (error) {
      toast.error("Не удалось привязать клиента: " + error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["task-crm-context", activeTaskId] });
    qc.invalidateQueries({ queryKey: ["crm-tasks"] });
    qc.invalidateQueries({ queryKey: ["crm-partners"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    toast.success(clientId ? "Задача привязана к клиенту" : "Клиент отвязан");
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
      if (unreadOnly) {
        const unread = isThreadUnread?.(t.id, t.lastMessageAt, t.lastMessageUserId) ?? false;
        if (!unread) return false;
      }
      return true;
    });
  }, [threads, search, authorIds, projectIds, unreadOnly, isThreadUnread]);

  const unreadTotal = useMemo(() => {
    if (!isThreadUnread) return 0;
    let n = 0;
    for (const t of threads) {
      if (isThreadUnread(t.id, t.lastMessageAt, t.lastMessageUserId)) n++;
    }
    return n;
  }, [threads, isThreadUnread]);

  const activeFilterCount = authorIds.length + projectIds.length + (unreadOnly ? 1 : 0);
  const clearAllFilters = () => { setAuthorIds([]); setProjectIds([]); setUnreadOnly(false); };
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
          <div className="flex items-center gap-1">
            {threads.length > 0 && (
              <button
                onClick={() => {
                  const first = threads[0];
                  navigate(first.taskId ? `/chat/${first.groupId}?task=${first.taskId}` : `/chat/${first.groupId}`);
                  onClose();
                }}
                title="Открыть на весь экран"
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
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
          {/* One-line bar: icon filters on the left, text segmented Чат/Лог/Всё on the right. */}
          <div className="flex items-center gap-1 mt-2">
            <button
              type="button"
              onClick={() => setUnreadOnly(v => !v)}
              className={cn(
                "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                unreadOnly
                  ? "bg-destructive/10 border-destructive/30 text-destructive"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
              title="Только непрочитанные"
              aria-label="Только непрочитанные"
            >
              <MailWarning className="h-3.5 w-3.5" />
              {unreadTotal > 0 && (
                <span className={cn(
                  "absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center",
                  unreadOnly ? "bg-destructive text-destructive-foreground" : "bg-muted-foreground/30 text-foreground",
                )}>
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
            </button>
            <FilterChip
              icon={<UserIcon className="h-3.5 w-3.5" />}
              label="Автор"
              iconOnly
              count={authorIds.length}
              options={authorOptions}
              selected={authorIds}
              onToggle={(id) => toggleId(authorIds, setAuthorIds, id)}
              onClear={() => setAuthorIds([])}
              emptyHint="Нет авторов"
            />
            <FilterChip
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Проект"
              iconOnly
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
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Сбросить фильтры"
              >
                Сбросить
              </button>
            )}
            <div className="ml-auto inline-flex shrink-0 rounded-md border border-border bg-muted/40 p-0.5 text-[11px]">
              {([
                { key: "chat", label: "Чат" },
                { key: "log",  label: "Лог" },
                { key: "all",  label: "Всё" },
              ] as { key: ThreadKindFilter; label: string }[]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setKindFilter(opt.key)}
                  className={cn(
                    "px-2 py-0.5 rounded-[5px] font-medium transition-colors",
                    kindFilter === opt.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                const isClientRoom = isProject && thread.groupProjectType === "crm_client";
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
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={cn(
                            "text-sm truncate",
                            unread ? "font-bold text-foreground" : isProject ? "font-semibold text-foreground" : "font-medium text-foreground",
                            thread.type === "task" && thread.taskCompleted && "line-through text-muted-foreground",
                          )}>
                            {thread.name}
                          </span>
                          {thread.type === "task" && thread.taskCompleted && (
                            <ClosedTaskPill className="shrink-0" />
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatThreadDate(thread.lastMessageAt)}
                        </span>
                      </div>
                      {isClientRoom ? (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          Клиент
                        </span>
                      ) : isProject ? (
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
      {/* Back header — single-line compact design */}
      <div className="flex items-center gap-1.5 px-3 h-11 border-b border-border shrink-0">
        <button
          onClick={clearActiveThread}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title="К списку чатов"
          aria-label="К списку чатов"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (activeThread.type === "group" && activeThread.groupId && onNavigateToProject) {
              if (onOpenProjectDetail) {
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
            "flex-1 min-w-0 flex items-center gap-1.5 text-left rounded-md px-1.5 py-1 -mx-1.5",
            ((activeThread.type === "group" && onNavigateToProject) || (activeThread.type === "task" && onNavigateToTask)) &&
              "hover:bg-muted transition-colors cursor-pointer",
          )}
          title={
            (activeThread.type === "group" ? "Чат проекта: " : "Чат задачи: ") +
            activeThread.name +
            (activeThread.groupName ? ` · ${activeThread.groupName}` : "")
          }
        >
          {activeThread.type === "group" ? (
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span
            className={cn(
              "text-sm font-semibold truncate",
              activeThread.type === "task" && activeThread.taskCompleted
                ? "line-through text-muted-foreground"
                : "text-foreground",
            )}
          >
            {activeThread.name}
          </span>
          {activeThread.type === "task" && activeThread.taskCompleted && (
            <ClosedTaskPill className="shrink-0" />
          )}
          {activeThread.type === "task" && activeThread.groupName && (
            <span className="text-[11px] text-muted-foreground truncate shrink min-w-0">
              · {activeThread.groupName}
            </span>
          )}
        </button>
        {activeThread.type === "task" && crmContext?.isCrm && (
          <TaskClientPicker
            clientId={crmContext.clientId ?? null}
            onChange={handleLinkClient}
            label="Клиент"
            buttonClassName="shrink-0"
          />
        )}
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="Свернуть чат (тред сохранится)"
            aria-label="Свернуть чат"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        )}
        {activeThread.type === "group" && activeThread.groupId && (
          <button
            onClick={() => { navigate(`/chat/${activeThread.groupId}`); onClose(); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="Развернуть на весь экран"
            aria-label="Развернуть на весь экран"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        {activeThread.type === "task" && activeThread.taskId && activeThread.groupId && (
          <button
            onClick={() => { navigate(`/chat/${activeThread.groupId}?task=${activeThread.taskId}`); onClose(); }}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
            title="Развернуть на весь экран"
            aria-label="Развернуть на весь экран"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Chat content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-hidden"
      >
        {activeThread.type === "group" && activeThread.groupId ? (
          <ProjectRoomCenter
            key={activeThread.groupId}
            groupId={activeThread.groupId}
            groupName={activeThread.name}
            hideHeader
            onClose={clearActiveThread}
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
            isCompleted={activeThread.taskCompleted}
            groupId={activeThread.groupId ?? null}
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
  iconOnly,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  emptyHint: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={cn(
            "relative inline-flex items-center gap-1 rounded-md border transition-colors text-[11px]",
            iconOnly ? "h-7 w-7 justify-center" : "px-2 py-0.5 rounded-full",
            count > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          {icon}
          {!iconOnly && <span>{label}</span>}
          {count > 0 && (
            iconOnly ? (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[15px] h-[15px] rounded-full bg-primary text-primary-foreground text-[9px] font-bold px-1">
                {count}
              </span>
            ) : (
              <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1">
                {count}
              </span>
            )
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
