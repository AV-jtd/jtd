import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import ChatRoomsList from "@/components/chat/ChatRoomsList";
import ClientContextPanel from "@/components/chat/ClientContextPanel";
import ClientRoomCenter from "@/components/chat/ClientRoomCenter";
import ProjectRoomCenter from "@/components/chat/ProjectRoomCenter";
import TaskDetailSheet from "@/components/chat/TaskDetailSheet";
import { ArrowLeft } from "lucide-react";
import ResizableSidebar from "@/components/ui/resizable-sidebar";

export default function ChatFullscreen() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const [group, setGroup] = useState<{ name: string; client_id: string | null } | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "info">("chat");
  /** Задача, открытая поверх чата (чат-лист и «Чаты задач» остаются под шторкой). */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const select = (gid: string) => {
    navigate(`/chat/${gid}`);
    if (isMobile) setMobilePane("chat");
  };

  // Открываем задачу как overlay поверх полноэкранного чата — список чатов
  // по задачам остаётся на месте (кросс-апп консистентность с мессенджером).
  const openTask = (taskId: string) => setOpenTaskId(taskId);

  if (!groupId) {
    navigate("/", { replace: true });
    return null;
  }

  const hasClient = !!group?.client_id;

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
        <div className="min-h-0 flex-1">
          {mobilePane === "list" && (
            <ChatRoomsList activeGroupId={groupId} onSelect={select} onSelectTask={openTask} onHome={() => navigate("/")} />
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
      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      <ResizableSidebar storageKey="sidebar_width_chat_rooms" defaultWidth={288} minWidth={220} maxWidth={460} side="right" className="border-r border-border">
        <ChatRoomsList activeGroupId={groupId} onSelect={select} />
      </ResizableSidebar>
      <div className="min-w-0 flex-1">
        {hasClient ? (
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
      {hasClient && (
        <ResizableSidebar storageKey="sidebar_width_client_panel" defaultWidth={320} minWidth={260} maxWidth={520} side="left" className="border-l border-border">
          <ClientContextPanel clientId={group!.client_id} onNavigateToTask={openTask} />
        </ResizableSidebar>
      )}
    </div>
  );
}
