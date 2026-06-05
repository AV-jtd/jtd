import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import ProjectChat from "@/components/ProjectChat";
import ChatRoomsList from "@/components/chat/ChatRoomsList";
import ClientContextPanel from "@/components/chat/ClientContextPanel";
import ClientRoomCenter from "@/components/chat/ClientRoomCenter";
import { ArrowLeft, PanelLeft, Info } from "lucide-react";
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
        <div className="flex items-center gap-1 border-b border-border px-2 py-2 shrink-0">
          <button onClick={() => navigate("/")} className="rounded-lg p-2 hover:bg-muted" title="На главную">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMobilePane("list")}
            className={cn("rounded-lg p-2", mobilePane === "list" ? "bg-primary/10 text-primary" : "hover:bg-muted")}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span className="mx-2 flex-1 truncate text-sm font-semibold">{group?.name || "Чат"}</span>
          {hasClient && (
            <button
              onClick={() => setMobilePane(mobilePane === "info" ? "chat" : "info")}
              className={cn("rounded-lg p-2", mobilePane === "info" ? "bg-primary/10 text-primary" : "hover:bg-muted")}
            >
              <Info className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          {mobilePane === "list" && <ChatRoomsList activeGroupId={groupId} onSelect={select} />}
          {mobilePane === "chat" && (hasClient ? (
            <ClientRoomCenter
              key={groupId}
              groupId={groupId}
              groupName={group?.name || "Чат"}
              clientId={group!.client_id!}
              fullscreen
              onBack={() => setMobilePane("list")}
              onClose={() => navigate("/")}
              onNavigateToTask={openTask}
            />
          ) : (
            <ProjectChat
              key={groupId}
              groupId={groupId}
              groupName={group?.name || "Чат"}
              fullscreen
              embedded
              onClose={() => navigate("/")}
              onNavigateToTask={openTask}
            />
          ))}
          {mobilePane === "info" && hasClient && (
            <ClientContextPanel clientId={group!.client_id} onNavigateToTask={openTask} />
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
          <ProjectChat
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
