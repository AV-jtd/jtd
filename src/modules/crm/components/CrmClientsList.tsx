import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X, Phone, Mail, MapPin, User, Building2 } from "lucide-react";
import ClientAvatar from "@/components/ClientAvatar";
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
  const [search, setSearch] = useState("");

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

  // Active deal counts per client
  const { data: dealCounts = {} } = useQuery({
    queryKey: ["crm-partners-deal-counts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("client_id")
        .not("client_id", "is", null)
        .eq("is_completed", false);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const cid = (row as { client_id: string | null }).client_id;
        if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
      }
      return counts;
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
              const deals = dealCounts[c.id] ?? 0;
              const manager = c.manager_id ? managers[c.manager_id] : null;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-muted/50 transition-colors"
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
                  <div
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full shrink-0 font-medium",
                      deals > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                    title="Активных сделок"
                  >
                    {deals} {deals === 1 ? "сделка" : "сделок"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}