import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import ChatRoomsList from "@/components/chat/ChatRoomsList";
import ClientContextPanel from "@/components/chat/ClientContextPanel";
import ClientRoomCenter from "@/components/chat/ClientRoomCenter";
import ProjectRoomCenter from "@/components/chat/ProjectRoomCenter";
import TaskRoomCenter from "@/components/chat/TaskRoomCenter";
import TaskDetailPanel from "@/components/chat/TaskDetailPanel";
import MyTasksDashboard from "@/components/chat/MyTasksDashboard";
import AssistantChannel from "@/components/chat/AssistantChannel";
import { ArrowLeft } from "lucide-react";
import ResizableSidebar from "@/components/ui/resizable-sidebar";

export default function ChatFullscreen() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const { markThreadRead } = useUnreadMessages();
  const [group, setGroup] = useState<{ name: string; client_id: string | null } | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "info" | "task" | "taskinfo">("chat");
  /** Задача в центре чата живёт в URL (`?task=…`) — переживает перезагрузку
   *  и шарится ссылкой. */
  const [searchParams, setSearchParams] = useSearchParams();
  const openTaskId = searchParams.get("task");
  /** Активный персональный канал «ИИ-ассистент» (`?view=assistant`) — ядро ЭФИРа. */
  const showAssistant = searchParams.get("view") === "assistant";
  /** Панель «Мои задачи» (`?view=mytasks`) — на мобильных это вкладка канала
   *  ассистента, на десктопе дашборд живёт в правом сайдбаре. */
  const showMyTasks = searchParams.get("view") === "mytasks";
  /** Показывать ли правый сайдбар с карточкой задачи (desktop). */
  const [showTaskInfo, setShowTaskInfo] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const { data } = await supabase
        .from("task_groups")
        .select("name, client_id")
        .eq("id", groupId)
        .maybeSingle();
      setGroup(data ? { name: (data as any).name, client_id: (data as any).client_id ?? null } : null);
    })();
  }, [groupId]);

  // Открытая комната считается прочитанной — сбрасываем непрочитанные.
  useEffect(() => {
    if (groupId) markThreadRead(`group-${groupId}`);
  }, [groupId, markThreadRead]);

  // Прочитанность + правильная панель при открытии задачи (в т.ч. из URL).
  useEffect(() => {
    if (!openTaskId) return;
    markThreadRead(`task-${openTaskId}`);
    if (isMobile) setMobilePane((p) => (p === "task" || p === "taskinfo" ? p : "task"));
  }, [openTaskId, isMobile, markThreadRead]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const select = (gid: string) => {
    navigate(`/chat/${gid}`);
    if (isMobile) setMobilePane("chat");
  };

  // Клик по чату задачи: открываем чат задачи ПО ЦЕНТРУ, карточка задачи —
  // в правом сайдбаре. Список чатов слева остаётся на месте.
  const openTask = (taskId: string) => {
    setShowTaskInfo(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("task", taskId);
        next.delete("view");
        return next;
      },
      { replace: false },
    );
    if (isMobile) setMobilePane("task");
  };
  const closeTask = () => {
    const from = searchParams.get("from");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("task");
        next.delete("from");
        if (from === "mytasks") next.set("view", "mytasks");
        else if (from === "assistant") next.set("view", "assistant");
        return next;
      },
      { replace: false },
    );
    if (isMobile) setMobilePane("chat");
  };
  // Открытие задачи из дашборда «Мои задачи». Помечаем источник (`from`),
  // чтобы кнопка «Назад»/«Закрыть» вернула пользователя в нужную панель.
  const openTaskFrom = (from: "mytasks" | "assistant") => (taskId: string) => {
    setShowTaskInfo(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("task", taskId);
        next.set("from", from);
        next.delete("view");
        return next;
      },
      { replace: false },
    );
    if (isMobile) setMobilePane("task");
  };
  const openTaskFromMyTasks = openTaskFrom("mytasks");
  const openTaskFromAssistant = openTaskFrom("assistant");
  // Переход из хлебных крошек задачи в групповой чат проекта.
  const navigateToGroup = (gid: string) => {
    navigate(`/chat/${gid}`);
    if (isMobile) setMobilePane("chat");
  };

  // Открыть персональный канал «ИИ-ассистент» (ядро ЭФИРа).
  const openAssistant = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "assistant");
        next.delete("task");
        return next;
      },
      { replace: false },
    );
  };
  const closeAssistant = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("view");
        return next;
      },
      { replace: false },
    );
  };
  // Открыть/закрыть панель «Мои задачи» (мобильная вкладка канала ассистента).
  const openMyTasks = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "mytasks");
        next.delete("task");
        return next;
      },
      { replace: false },
    );
  };
  const closeMyTasks = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "assistant");
        return next;
      },
      { replace: false },
    );
  };

  const hasClient = !!group?.client_id;

  // Закреплённый мини-дашборд «Мои задачи» — единый рендер для всех маршрутов.
  if (showMyTasks) {
    if (isMobile) {
      return (
        <div className="flex h-[100dvh] flex-col bg-background">
          <div className="min-h-0 flex-1">
            <MyTasksDashboard onOpenTask={openTaskFromMyTasks} onClose={closeMyTasks} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-[100dvh] bg-background">
        <ResizableSidebar storageKey="sidebar_width_chat_rooms" defaultWidth={288} minWidth={220} maxWidth={460} side="right" className="border-r border-border">
          <ChatRoomsList activeGroupId={groupId ?? null} activeTaskId={openTaskId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} onOpenMyTasks={openMyTasks} myTasksActive />
        </ResizableSidebar>
        <div className="min-w-0 flex-1">
          <MyTasksDashboard onOpenTask={openTaskFromMyTasks} onClose={closeMyTasks} />
        </div>
      </div>
    );
  }

  // Общая полноэкранная страница чатов без выбранной комнаты (`/chat`).
  if (!groupId) {
    if (isMobile) {
      return (
        <div className="flex h-[100dvh] flex-col bg-background">
          <div className="min-h-0 flex-1">
            {openTaskId ? (
              <TaskRoomCenter
                key={openTaskId}
                taskId={openTaskId}
                onBack={closeTask}
                onClose={closeTask}
                onNavigateToTask={openTask}
                onNavigateToGroup={navigateToGroup}
              />
            ) : (
              <ChatRoomsList activeGroupId={null} activeTaskId={openTaskId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} onOpenMyTasks={openMyTasks} myTasksActive={false} />
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-[100dvh] bg-background">
        <ResizableSidebar storageKey="sidebar_width_chat_rooms" defaultWidth={288} minWidth={220} maxWidth={460} side="right" className="border-r border-border">
          <ChatRoomsList activeGroupId={null} activeTaskId={openTaskId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} onOpenMyTasks={openMyTasks} myTasksActive={false} />
        </ResizableSidebar>
        {openTaskId ? (
          <div className="min-w-0 flex-1">
            <TaskRoomCenter
              key={openTaskId}
              taskId={openTaskId}
              onClose={closeTask}
              onNavigateToTask={openTask}
              onNavigateToGroup={navigateToGroup}
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            Выберите чат слева
          </div>
        )}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <div className="min-h-0 flex-1">
          {mobilePane === "list" && (
            <ChatRoomsList activeGroupId={groupId} activeTaskId={openTaskId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} onOpenMyTasks={openMyTasks} myTasksActive={false} />
          )}
          {mobilePane === "task" && openTaskId && (
            <TaskRoomCenter
              key={openTaskId}
              taskId={openTaskId}
              onBack={() => setMobilePane("list")}
              onClose={closeTask}
              onShowInfo={() => setMobilePane("taskinfo")}
              onNavigateToTask={openTask}
              onNavigateToGroup={navigateToGroup}
            />
          )}
          {mobilePane === "taskinfo" && openTaskId && (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
                <button onClick={() => setMobilePane("task")} className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Назад к чату" aria-label="Назад к чату">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="truncate text-sm font-semibold">Карточка задачи</span>
              </div>
              <div className="min-h-0 flex-1">
                <TaskDetailPanel taskId={openTaskId} onClose={() => setMobilePane("task")} />
              </div>
            </div>
          )}
          {mobilePane === "chat" && (hasClient ? (
            <ClientRoomCenter
              key={groupId}
              groupId={groupId}
              groupName={group?.name || "Чат"}
              clientId={group!.client_id!}
              fullscreen
              onBack={() => setMobilePane("list")}
              onClose={() => navigate("/")}
              onShowInfo={() => setMobilePane("info")}
              onNavigateToTask={openTask}
            />
          ) : (
            <ProjectRoomCenter
              key={groupId}
              groupId={groupId}
              groupName={group?.name || "Чат"}
              fullscreen
              onBack={() => setMobilePane("list")}
              onClose={() => navigate("/")}
              onNavigateToTask={openTask}
            />
          ))}
          {mobilePane === "info" && hasClient && (
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
                <button onClick={() => setMobilePane("chat")} className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Назад к чату" aria-label="Назад к чату">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="truncate text-sm font-semibold">Карточка клиента</span>
              </div>
              <div className="min-h-0 flex-1">
                <ClientContextPanel clientId={group!.client_id} onNavigateToTask={openTask} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-background">
      <ResizableSidebar storageKey="sidebar_width_chat_rooms" defaultWidth={288} minWidth={220} maxWidth={460} side="right" className="border-r border-border">
        <ChatRoomsList activeGroupId={groupId} activeTaskId={openTaskId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} onOpenMyTasks={openMyTasks} myTasksActive={false} />
      </ResizableSidebar>
      <div className="min-w-0 flex-1">
        {openTaskId ? (
          <TaskRoomCenter
            key={openTaskId}
            taskId={openTaskId}
            onClose={closeTask}
            onShowInfo={() => setShowTaskInfo((v) => !v)}
            onNavigateToTask={openTask}
            onNavigateToGroup={navigateToGroup}
          />
        ) : hasClient ? (
          <ClientRoomCenter
            key={groupId}
            groupId={groupId}
            groupName={group?.name || "Чат"}
            clientId={group!.client_id!}
            fullscreen
            onClose={() => navigate("/")}
            onToggleFullscreen={() => navigate("/")}
            onNavigateToTask={openTask}
          />
        ) : (
          <ProjectRoomCenter
            key={groupId}
            groupId={groupId}
            groupName={group?.name || "Чат"}
            fullscreen
            onClose={() => navigate("/")}
            onToggleFullscreen={() => navigate("/")}
            onNavigateToTask={openTask}
          />
        )}
      </div>
      {openTaskId && showTaskInfo ? (
        <ResizableSidebar storageKey="sidebar_width_task_detail" defaultWidth={420} minWidth={320} maxWidth={560} side="left" className="border-l border-border">
          <TaskDetailPanel taskId={openTaskId} onClose={() => setShowTaskInfo(false)} />
        </ResizableSidebar>
      ) : !openTaskId && hasClient ? (
        <ResizableSidebar storageKey="sidebar_width_client_panel" defaultWidth={320} minWidth={260} maxWidth={520} side="left" className="border-l border-border">
          <ClientContextPanel clientId={group!.client_id} onNavigateToTask={openTask} />
        </ResizableSidebar>
      ) : null}
    </div>
  );
}
