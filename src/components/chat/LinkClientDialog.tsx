import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ClientAvatar from "@/components/ClientAvatar";
import { Loader2, Search, Building2 } from "lucide-react";

type ClientRow = {
  id: string; name: string; logo_url: string | null;
  contact_name: string | null; city: string | null;
};

/**
 * Диалог привязки существующего чата (task_group) к клиенту CRM.
 * Превращает обычный проектный чат в комнату клиента: задаёт client_id и
 * project_type='crm_client'. Если у клиента уже есть комната — переводит туда,
 * чтобы не нарушить уникальный индекс (project_type, client_id).
 */
export default function LinkClientDialog({
  groupId,
  open,
  onOpenChange,
  onLinked,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLinked?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["link-client-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, logo_url, contact_name, city")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
    enabled: !!user && open,
    staleTime: 60_000,
  });

  const link = useMutation({
    mutationFn: async (clientId: string) => {
      // У клиента уже есть комната?
      const { data: existing } = await supabase
        .from("task_groups")
        .select("id")
        .eq("project_type", "crm_client" as any)
        .eq("client_id", clientId as any)
        .maybeSingle();
      if (existing?.id && existing.id !== groupId) {
        return { redirectTo: existing.id as string };
      }
      const { error } = await supabase
        .from("task_groups")
        .update({ client_id: clientId, project_type: "crm_client" } as any)
        .eq("id", groupId);
      if (error) throw error;
      return { redirectTo: null as string | null };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["messenger-threads"] });
      onOpenChange(false);
      if (res.redirectTo) {
        toast.info("У клиента уже есть комната — открываю её");
        navigate(`/chat/${res.redirectTo}`);
      } else {
        toast.success("Чат привязан к клиенту");
        onLinked?.();
      }
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось привязать чат"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      `${c.name} ${c.contact_name ?? ""} ${c.city ?? ""}`.toLowerCase().includes(q),
    );
  }, [clients, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Привязать чат к клиенту</DialogTitle>
          <DialogDescription>
            Выберите клиента — чат станет комнатой клиента с карточкой, задачами и показателями.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск клиента..."
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Building2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">{search ? "Клиенты не найдены" : "Пока нет клиентов"}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => !link.isPending && link.mutate(c.id)}
                  disabled={link.isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <ClientAvatar client={c} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    {(c.contact_name || c.city) && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[c.contact_name, c.city].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  {link.isPending && link.variables === c.id && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}