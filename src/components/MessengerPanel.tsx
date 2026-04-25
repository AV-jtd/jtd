import { useState } from "react";
import { useThreads, Thread } from "@/hooks/useMessenger";
import { useAvailableUsers } from "@/hooks/useTasks";
import ProjectChat from "./ProjectChat";
import TaskChat from "./TaskChat";
import AiChatThread from "./AiChatThread";
import type { ModuleContext } from "@/components/AiAssistant";
import { X, MessageCircle, ArrowLeft, CheckSquare, FolderOpen, Search, Sparkles } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MessengerPanelProps {
  onClose: () => void;
  markThreadRead?: (threadId: string) => void;
  isThreadUnread?: (threadId: string, lastMessageAt: string | null, lastMessageUserId?: string | null) => boolean;
  onNavigateToProject?: (groupId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  /**
   * Module context propagated to the pinned AI assistant entry, so opening it
   * from the messenger lands in the same module/project scope as the global
   * AI Sheet (`AiAssistant`) opened from the header.
   */
  moduleContext?: ModuleContext;
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
  markThreadRead,
  isThreadUnread,
  onNavigateToProject,
  onNavigateToTask,
  moduleContext,
}: MessengerPanelProps) {
  const { data: threads = [], isLoading } = useThreads();
  const { data: availableUsers = [] } = useAvailableUsers();
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const [search, setSearch] = useState("");

  const handleOpenThread = (thread: Thread) => {
    setActiveThread(thread);
    markThreadRead?.(thread.id);
  };

  const filtered = search.trim()
    ? threads.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : threads;

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
                return (
                  <button
                    key={thread.id}
                    onClick={() => handleOpenThread(thread)}
                    className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="relative">
                      <div className={cn(
                        "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                        thread.type === "group" ? "bg-primary/10" : "bg-accent"
                      )}>
                        {thread.type === "group"
                          ? <FolderOpen className="h-4 w-4 text-primary" />
                          : <CheckSquare className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                      {unread && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm truncate", unread ? "font-bold text-foreground" : "font-medium text-foreground")}>
                          {thread.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatThreadDate(thread.lastMessageAt)}
                        </span>
                      </div>
                      {thread.groupName && thread.type === "task" && (
                        <p className="text-[10px] text-muted-foreground/60 truncate">{thread.groupName}</p>
                      )}
                      {thread.lastMessage && (
                        <p className={cn("text-xs truncate mt-0.5", unread ? "text-foreground/80 font-medium" : "text-muted-foreground")}>
                          {thread.lastMessageAuthor && (
                            <span className="font-medium text-foreground/60">{thread.lastMessageAuthor}: </span>
                          )}
                          {thread.lastMessage}
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
          onClick={() => setActiveThread(null)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (activeThread.type === "group" && activeThread.groupId && onNavigateToProject) {
              onNavigateToProject(activeThread.groupId);
              onClose();
            } else if (activeThread.type === "task" && activeThread.taskId && onNavigateToTask) {
              onNavigateToTask(activeThread.taskId);
              onClose();
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
            onClose={() => setActiveThread(null)}
            embedded
            onNavigateToProject={(gId) => { onNavigateToProject?.(gId); onClose(); }}
          />
        ) : activeThread.type === "task" && activeThread.taskId ? (
          <TaskChat
            taskId={activeThread.taskId}
            taskTitle={activeThread.name}
            availableUsers={availableUsers}
            variant="full"
          />
        ) : null}
      </div>
    </div>
  );
}
