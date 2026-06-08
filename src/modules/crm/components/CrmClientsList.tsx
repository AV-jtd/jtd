import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X, Phone, Mail, MapPin, User, Building2, MessageCircle, Users } from "lucide-react";
import ClientAvatar from "@/components/ClientAvatar";
import ClientTeamManager from "@/components/ClientTeamManager";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEnsureClientRoom } from "@/hooks/useChatRooms";
import { cn } from "@/lib/utils";

type PartnerRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  logo_url: string | null;
  manager_id: string | null;
  rank_tag_id: string | null;
};

/**
 * Список партнёров (клиентов) CRM — общий справочник.
 * Показывает аватар, имя, контакты, город, ответственного менеджера,
 * а также число активных сделок по клиенту.
 */
export default function CrmClientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const ensureRoom = useEnsureClientRoom();
  const [search, setSearch] = useState("");

  const openClientChat = async (clientId: string) => {
    const gid = await ensureRoom.mutateAsync(clientId);
    navigate(`/chat/${gid}`);
  };

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["crm-partners", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, phone, email, city, logo_url, manager_id, rank_tag_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PartnerRow[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Per-client task stats: открытые и просроченные задачи.
  // (Раньше тут было «количество сделок» — фактически просто число
  //  незавершённых задач клиента, что вводило в заблуждение.)
  const { data: taskStats = {} } = useQuery({
    queryKey: ["crm-partners-task-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("client_id, deadline")
        .not("client_id", "is", null)
        .eq("is_completed", false);
      if (error) throw error;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const stats: Record<string, { open: number; overdue: number }> = {};
      for (const row of data ?? []) {
        const r = row as { client_id: string | null; deadline: string | null };
        if (!r.client_id) continue;
        const s = (stats[r.client_id] ??= { open: 0, overdue: 0 });
        s.open += 1;
        if (r.deadline && new Date(r.deadline) < today) s.overdue += 1;
      }
      return stats;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Manager profiles
  const managerIds = useMemo(
    () => [...new Set(clients.map((c) => c.manager_id).filter(Boolean) as string[])],
    [clients],
  );
  const { data: managers = {} } = useQuery({
    queryKey: ["crm-partners-managers", managerIds],
    queryFn: async () => {
      if (managerIds.length === 0) return {};
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", managerIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        map[p.id] = p.display_name || p.email || "—";
      }
      return map;
    },
    enabled: managerIds.length > 0,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      `${c.name} ${c.contact_name ?? ""} ${c.city ?? ""} ${c.phone ?? ""} ${c.email ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [clients, search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-border bg-card/50 shrink-0 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск партнёра..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Building2 className="h-3.5 w-3.5" />
          <span className="font-semibold text-foreground">{filtered.length}</span>
          <span className="hidden sm:inline">партнёров</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Building2 className="h-10 w-10 opacity-30" />
            <p className="text-sm">
              {search ? "Партнёры не найдены" : "Пока нет партнёров"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((c) => {
              const stats = taskStats[c.id] ?? { open: 0, overdue: 0 };
              const manager = c.manager_id ? managers[c.manager_id] : null;
              return (
                <div
                  key={c.id}
                  onClick={() => openClientChat(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") openClientChat(c.id); }}
                  className="flex cursor-pointer items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/50 transition-colors"
                  title="Открыть карточку клиента"
                >
                  <ClientAvatar client={c} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                      {c.contact_name && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <User className="h-3 w-3 shrink-0" />
                          {c.contact_name}
                        </span>
                      )}
                      {c.city && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {c.city}
                        </span>
                      )}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Phone className="h-3 w-3 shrink-0" />
                          {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {c.email}
                        </span>
                      )}
                    </div>
                  </div>
                  {manager && (
                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                      <User className="h-3 w-3" />
                      {manager}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full font-medium",
                        stats.open > 0
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                      title="Открытых задач"
                    >
                      {stats.open} откр.
                    </span>
                    {stats.overdue > 0 && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-destructive/10 text-destructive"
                        title="Просроченных задач"
                      >
                        {stats.overdue} просроч.
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openClientChat(c.id); }}
                    disabled={ensureRoom.isPending}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                    title="Чат клиента"
                    aria-label="Открыть чат клиента"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}