import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, UserX, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface PendingUser {
  id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
  is_approved: boolean;
}

export default function AdminApproval() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, email, created_at, is_approved")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setUsers(data as PendingUser[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const handleApprove = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true } as any)
      .eq("id", userId);

    if (error) {
      toast.error("Ошибка: " + error.message);
    } else {
      toast.success("Пользователь одобрен");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: true } : u));
    }
  };

  const handleReject = async (userId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: false } as any)
      .eq("id", userId);

    if (error) {
      toast.error("Ошибка: " + error.message);
    } else {
      toast.success("Доступ отклонён");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: false } : u));
    }
  };

  if (!isAdmin) return null;

  const pending = users.filter(u => !u.is_approved);
  const approved = users.filter(u => u.is_approved);

  return (
    <div className="border-t border-border pt-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-medium">Управление пользователями</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Ожидают подтверждения ({pending.length})
              </p>
              {pending.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{u.display_name || "Без имени"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleApprove(u.id)} className="gap-1">
                      <UserCheck className="h-3.5 w-3.5" />
                      Одобрить
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleReject(u.id)} className="gap-1">
                      <UserX className="h-3.5 w-3.5" />
                      Отклонить
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Активные пользователи ({approved.length})
            </p>
            {approved.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{u.display_name || "Без имени"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">Активен</Badge>
              </div>
            ))}
          </div>

          {pending.length === 0 && approved.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет пользователей</p>
          )}
        </div>
      )}
    </div>
  );
}
