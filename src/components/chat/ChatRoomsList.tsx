import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, MessageCircle, Plus, Home, CheckSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ClientAvatar from "@/components/ClientAvatar";
import { useChatRooms, useEnsureClientRoom, type ChatRoom } from "@/hooks/useChatRooms";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";

function RankBadge({ label }: { label: string | null }) {
  if (!label) return null;
  const norm = label.trim().toUpperCase();
  const tone =
    norm.startsWith("A") ? "bg-tag-green/15 text-tag-green"
    : norm.startsWith("B") ? "bg-tag-blue/15 text-tag-blue"
    : norm.startsWith("C") ? "bg-tag-orange/15 text-tag-orange"
    : "bg-muted text-muted-foreground";
  return <span className={cn("ml-1 rounded px-1 text-[9px] font-bold leading-tight", tone)}>{norm}</span>;
}

function RoomAvatar({ room }: { room: ChatRoom }) {
  if (room.isTaskRoom) {
    return (
      <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/10 text-primary shrink-0">
        <CheckSquare className="h-4 w-4" />
      </div>
    );
  }
  if (room.isClientRoom) {
    return <ClientAvatar client={{ name: room.name, logo_url: room.groupLogoUrl }} size="md" />;
  }
  if (room.groupLogoUrl) {
    return <img src={room.groupLogoUrl} alt="" className="h-7 w-7 rounded-md object-cover ring-1 ring-border shrink-0" />;
  }
  return (
    <div
      className="h-7 w-7 rounded-md flex items-center justify-center text-xs shrink-0"
      style={{ backgroundColor: (room.groupColor || "#64748b") + "22" }}
    >
      {room.groupIcon || "📁"}
    </div>
  );
}

/** Список клиентов без комнаты — для быстрого создания CRM-комнаты. */
function NewClientRoomButton({ onOpen }: { onOpen: (groupId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ensure = useEnsureClientRoom();
  const { data: clients = [] } = useQuery({
    queryKey: ["crm_clients_picker"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, logo_url").order("name").limit(500);
      return (data as any[]) || [];
    },
    enabled: open,
    staleTime: 1000 * 60,
  });
  const filtered = useMemo(
    () => clients.filter((c) => c.name?.toLowerCase().includes(q.trim().toLowerCase())),
    [clients, q],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Открыть чат по клиенту"
        >
          <Plus className="h-3.5 w-3.5" /> Клиент
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск клиента…"
          className="mb-2 h-8"
        />
        <ScrollArea className="max-h-64">
          <div className="space-y-0.5">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={async () => {
                  const gid = await ensure.mutateAsync(c.id);
                  setOpen(false);
                  onOpen(gid);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <ClientAvatar client={c} size="sm" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Ничего не найдено</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function ChatRoomsList({
  activeGroupId,
  onSelect,
  onSelectTask,
  onHome,
}: {
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onSelectTask?: (taskId: string) => void;
  onHome?: () => void;
}) {
  const { rooms, isLoading } = useChatRooms();
  const { isThreadUnread } = useUnreadMessages();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "projects" | "clients" | "tasks">("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rooms.filter((r) => {
      if (filter === "projects" && (r.isClientRoom || r.isTaskRoom)) return false;
      if (filter === "clients" && !r.isClientRoom) return false;
      if (filter === "tasks" && !r.isTaskRoom) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || r.lastMessage?.toLowerCase().includes(s);
    });
  }, [rooms, q, filter]);

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "projects", label: "Проекты" },
    { key: "clients", label: "Клиенты" },
    { key: "tasks", label: "Задачи" },
  ];

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          {onHome && (
            <button onClick={onHome} className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted" title="На главную" aria-label="На главную">
              <Home className="h-4 w-4" />
            </button>
          )}
          <span className="text-sm font-semibold">Чаты</span>
        </div>
        <NewClientRoomButton onOpen={onSelect} />
      </div>
      <div className="px-2 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="h-8 pl-7" />
        </div>
        <div className="mt-2 flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-2 pb-3">
          {isLoading && <p className="px-2 py-4 text-xs text-muted-foreground">Загрузка…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Нет чатов</p>
          )}
          {filtered.map((room) => {
            const unread = isThreadUnread(room.threadId, room.lastMessageAt, room.lastMessageUserId);
            return (
              <button
                key={room.groupId}
                onClick={() => (room.isTaskRoom && room.taskId ? onSelectTask?.(room.taskId) : onSelect(room.groupId))}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                  room.groupId === activeGroupId ? "bg-primary/10" : "hover:bg-muted",
                )}
              >
                <RoomAvatar room={room} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium", room.taskCompleted && "line-through opacity-60")}>
                      {room.name}
                    </span>
                    {room.isClientRoom && <RankBadge label={room.client?.rankLabel ?? null} />}
                    {room.lastMessageAt && (
                      <span className="ml-auto pl-2 text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNowStrict(new Date(room.lastMessageAt), { locale: ru })}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {room.isTaskRoom && room.parentName ? (
                      <span className="opacity-70">{room.parentName} · </span>
                    ) : null}
                    {room.lastMessage ? (
                      <>
                        {room.lastMessageAuthor && <span className="opacity-80">{room.lastMessageAuthor}: </span>}
                        {room.lastMessage}
                      </>
                    ) : room.isClientRoom ? (
                      <span className="italic opacity-70">CRM-комната клиента</span>
                    ) : (
                      <span className="italic opacity-70">Нет сообщений</span>
                    )}
                  </p>
                </div>
                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
