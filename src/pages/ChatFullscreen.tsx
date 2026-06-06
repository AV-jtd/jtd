import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import ChatRoomsList from "@/components/chat/ChatRoomsList";
import ClientContextPanel from "@/components/chat/ClientContextPanel";
import ClientRoomCenter from "@/components/chat/ClientRoomCenter";
import ProjectRoomCenter from "@/components/chat/ProjectRoomCenter";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ChatFullscreen() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const [group, setGroup] = useState<{ name: string; client_id: string | null } | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "info">("chat");

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

  const openTask = (taskId: string) => navigate(`/?task=${taskId}`);

  if (!groupId) {
    navigate("/", { replace: true });
    return null;
  }

  const hasClient = !!group?.client_id;

  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <div className="min-h-0 flex-1">
          {mobilePane === "list" && (
            <ChatRoomsList activeGroupId={groupId} onSelect={select} onHome={() => navigate("/")} />
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
      <div className="w-72 shrink-0 border-r border-border">
        <ChatRoomsList activeGroupId={groupId} onSelect={select} />
      </div>
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
        <div className="w-80 shrink-0 border-l border-border">
          <ClientContextPanel clientId={group!.client_id} onNavigateToTask={openTask} />
        </div>
      )}
    </div>
  );
}
