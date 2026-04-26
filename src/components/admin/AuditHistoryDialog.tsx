import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, History } from "lucide-react";
import type { AdminUser } from "./types";

interface AuditEntry {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  action: string;
  created_at: string;
  changed_by: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  display_name: "Имя",
  department_id: "Отдел",
  organization: "Организация",
  is_approved: "Статус активации",
  contractor_id: "Подрядчик",
  client_id: "Клиент CRM",
  __deleted__: "Удаление",
};

export function AuditHistoryDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [deptNames, setDeptNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("profile_audit_log" as any)
        .select("*")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (data ?? []) as unknown as AuditEntry[];
      setEntries(list);

      // Fetch actor display names
      const actorIds = Array.from(new Set(list.map(e => e.changed_by).filter(Boolean))) as string[];
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", actorIds);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.display_name || p.email || p.id.slice(0, 8); });
        setActorNames(map);
      }

      // Fetch department names
      const deptIds = Array.from(new Set(
        list.filter(e => e.field_name === "department_id").flatMap(e => [e.old_value, e.new_value]).filter(Boolean)
      )) as string[];
      if (deptIds.length) {
        const { data: dps } = await supabase.from("departments").select("id, name").in("id", deptIds);
        const map: Record<string, string> = {};
        (dps ?? []).forEach((d: any) => { map[d.id] = d.name; });
        setDeptNames(map);
      }
      setLoading(false);
    })();
  }, [user]);

  const formatValue = (field: string, val: string | null) => {
    if (val === null || val === "") return "—";
    if (field === "is_approved") return val === "true" ? "Активен" : "Не активен";
    if (field === "department_id") return deptNames[val] || val.slice(0, 8);
    if (field === "contractor_id" || field === "client_id") return val.slice(0, 8) + "…";
    return val;
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            История изменений: {user?.display_name || user?.email}
          </DialogTitle>
          <DialogDescription>Последние 100 изменений профиля</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">История пуста — изменения отслеживаются с момента подключения аудита.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(e => (
              <div key={e.id} className="text-xs border-l-2 border-border pl-3 py-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium">{FIELD_LABELS[e.field_name] || e.field_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(e.created_at).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  <span className="line-through opacity-60">{formatValue(e.field_name, e.old_value)}</span>
                  <span className="mx-2">→</span>
                  <span className="text-foreground">{formatValue(e.field_name, e.new_value)}</span>
                </div>
                {e.changed_by && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Кем: {actorNames[e.changed_by] || e.changed_by.slice(0, 8)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
