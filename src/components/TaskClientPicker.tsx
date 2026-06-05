import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, Plus, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  name: string;
  contact_name: string | null;
  city: string | null;
};

interface Props {
  clientId: string | null | undefined;
  /** Called with new clientId (or null to detach). Should persist to DB. */
  onChange: (clientId: string | null) => void;
  /** Optional className for trigger button */
  buttonClassName?: string;
  /** Optional title attribute override */
  title?: string;
  /**
   * When provided, renders a labeled bordered button (icon + text) instead of
   * the bare icon. Useful in toolbars (e.g. CRM task chat header).
   * The label is shown when no client is linked; once linked, the client name
   * is shown instead.
   */
  label?: string;
}

/**
 * Compact picker for linking a task to a CRM client.
 * - Searchable list of clients (shared registry).
 * - Inline create via RPC `upsert_client_by_name` (dedup-safe).
 * - Detach button when already linked.
 */
export default function TaskClientPicker({ clientId, onChange, buttonClassName, title, label }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "task-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, city")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
    staleTime: 60_000,
  });

  const linked = useMemo(
    () => (clientId ? clients.find((c) => c.id === clientId) ?? null : null),
    [clientId, clients],
  );

  const trimmedSearch = search.trim();
  const exactMatch = useMemo(
    () => clients.find((c) => c.name.trim().toLowerCase() === trimmedSearch.toLowerCase()),
    [clients, trimmedSearch],
  );
  const showCreate = trimmedSearch.length >= 2 && !exactMatch;

  const filtered = useMemo(() => {
    if (!trimmedSearch) return clients.slice(0, 50);
    const q = trimmedSearch.toLowerCase();
    return clients
      .filter((c) =>
        `${c.name} ${c.contact_name ?? ""} ${c.city ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clients, trimmedSearch]);

  const createClient = async () => {
    if (!user || !trimmedSearch || creating) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("upsert_client_by_name", {
        _name: trimmedSearch,
        _user_id: user.id,
      });
      if (error) throw error;
      const newId = data as string;
      await qc.invalidateQueries({ queryKey: ["clients"] });
      onChange(newId);
      toast.success(`Клиент «${trimmedSearch}» создан`);
      setOpen(false);
      setSearch("");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось создать клиента");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {label ? (
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              linked
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted",
              buttonClassName,
            )}
            title={title ?? (linked ? `Клиент: ${linked.name}` : "Привязать к клиенту")}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span className="max-w-[160px] truncate">{linked ? linked.name : label}</span>
          </button>
        ) : (
        <button
          className={cn(
            "p-1.5 rounded transition-colors",
            linked ? "text-primary" : "text-muted-foreground hover:text-primary",
            buttonClassName,
          )}
          title={title ?? (linked ? `Клиент: ${linked.name}` : "Привязать к клиенту")}
        >
          <Building2 className="h-3.5 w-3.5" />
        </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 bg-popover border-border z-50" side="left">
        {linked && (
          <div className="mb-2 px-2 py-1.5 rounded bg-primary/5 border border-primary/20">
            <div className="text-xs font-medium text-primary truncate">{linked.name}</div>
            {linked.contact_name && (
              <div className="text-[10px] text-muted-foreground truncate">{linked.contact_name}</div>
            )}
          </div>
        )}
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти или создать клиента..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5 overscroll-contain">
          {filtered.length === 0 && !showCreate && (
            <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className={cn(
                "flex flex-col items-start w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left",
                clientId === c.id && "bg-primary/10 text-primary",
              )}
            >
              <span className="truncate w-full">{c.name}</span>
              {(c.contact_name || c.city) && (
                <span className="text-[10px] text-muted-foreground truncate w-full">
                  {[c.contact_name, c.city].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          ))}
        </div>
        {showCreate && (
          <button
            onClick={createClient}
            disabled={creating}
            className="mt-1 flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10 transition-colors border-t border-border pt-1.5"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Создать «{trimmedSearch}»
          </button>
        )}
        {linked && (
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="mt-1 text-xs text-destructive hover:underline w-full text-left px-2 py-1 border-t border-border pt-1.5"
          >
            Отвязать клиента
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}