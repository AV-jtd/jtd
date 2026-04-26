import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck, UserX, ShieldCheck, Building2, HardHat, Briefcase, Search, Pencil, Check, X, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useContractors } from "@/hooks/useContractors";
import { useQuery } from "@tanstack/react-query";

interface PendingUser {
  id: string;
  display_name: string | null;
  email: string | null;
  telegram_username: string | null;
  created_at: string;
  is_approved: boolean;
  department_id: string | null;
  organization: string | null;
  contractor_id: string | null;
  client_id: string | null;
}

interface Department { id: string; name: string; }
interface ClientLite { id: string; name: string; }

export default function AdminApproval() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const { data: contractors = [] } = useContractors();
  const { data: clients = [] } = useQuery<ClientLite[]>({
    queryKey: ["clients", "lite-for-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
    enabled: !!isAdmin,
    staleTime: 60_000,
  });

  const fetchUsers = async () => {
    const [{ data: profiles }, { data: depts }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, email, telegram_username, created_at, is_approved, department_id, organization, contractor_id, client_id")
        .order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name").order("position"),
    ]);
    if (profiles) setUsers(profiles as PendingUser[]);
    if (depts) setDepartments(depts as Department[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const handleToggleApproval = async (userId: string, approve: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: approve } as any)
      .eq("id", userId);

    if (error) {
      toast.error("Ошибка: " + error.message);
    } else {
      toast.success(approve ? "Пользователь активирован" : "Пользователь деактивирован");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: approve } : u));
    }
  };

  const handleDepartmentChange = async (userId: string, deptId: string | null) => {
    const { error } = await supabase
      .from("profiles")
      .update({ department_id: deptId } as any)
      .eq("id", userId);
    if (error) {
      toast.error("Не удалось обновить отдел: " + error.message);
      return;
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, department_id: deptId } : u));
    toast.success(deptId ? "Отдел обновлён" : "Отдел снят");
  };

  const updateUserField = async (userId: string, patch: Partial<PendingUser>) => {
    const { error } = await supabase
      .from("profiles")
      .update(patch as any)
      .eq("id", userId);
    if (error) {
      toast.error("Не удалось сохранить: " + error.message);
      return;
    }
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u));
  };

  const startEditName = (u: PendingUser) => {
    setEditingNameId(u.id);
    setEditingNameValue(u.display_name ?? "");
  };

  const saveName = async (userId: string) => {
    const v = editingNameValue.trim() || null;
    await updateUserField(userId, { display_name: v });
    setEditingNameId(null);
    toast.success("Имя обновлено");
  };

  const renderDeptSelect = (u: PendingUser) => (
    <Select
      value={u.department_id ?? "__none"}
      onValueChange={(v) => handleDepartmentChange(u.id, v === "__none" ? null : v)}
    >
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
        <SelectValue placeholder="Отдел" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none" className="text-xs text-muted-foreground">— Без отдела —</SelectItem>
        {departments.map((d) => (
          <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderExtraFields = (u: PendingUser) => (
    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
      <Input
        key={`org-${u.id}-${u.organization ?? ""}`}
        defaultValue={u.organization ?? ""}
        placeholder="Организация"
        className="h-8 w-[180px] text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== (u.organization ?? null)) updateUserField(u.id, { organization: v });
        }}
      />
      <Select
        value={u.contractor_id ?? "__none"}
        onValueChange={(v) => updateUserField(u.id, { contractor_id: v === "__none" ? null : v })}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <HardHat className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Подрядчик" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none" className="text-xs text-muted-foreground">— Не задан —</SelectItem>
          {contractors.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={u.client_id ?? "__none"}
        onValueChange={(v) => updateUserField(u.id, { client_id: v === "__none" ? null : v })}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <Briefcase className="h-3 w-3 mr-1 text-muted-foreground" />
          <SelectValue placeholder="Клиент CRM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none" className="text-xs text-muted-foreground">— Не задан —</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderNameBlock = (u: PendingUser) => {
    if (editingNameId === u.id) {
      return (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={editingNameValue}
            onChange={(e) => setEditingNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveName(u.id); }
              if (e.key === "Escape") { e.preventDefault(); setEditingNameId(null); }
            }}
            className="h-7 text-sm font-medium w-[200px]"
            placeholder="ФИО"
          />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => saveName(u.id)}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingNameId(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 group/name">
        <p className="text-sm font-medium truncate">{u.display_name || <span className="text-muted-foreground italic">Без имени</span>}</p>
        <button
          onClick={() => startEditName(u)}
          className="p-1 rounded hover:bg-muted opacity-0 group-hover/name:opacity-100 transition-opacity"
          aria-label="Редактировать имя"
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  };

  const renderUserMeta = (u: PendingUser) => (
    <div className="text-xs text-muted-foreground space-y-0.5 mt-0.5">
      {u.email && (
        <div className="flex items-center gap-1">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{u.email}</span>
        </div>
      )}
      {u.telegram_username && <p>@{u.telegram_username}</p>}
      <p>Зарегистрирован: {new Date(u.created_at).toLocaleDateString("ru-RU")}</p>
    </div>
  );

  if (!isAdmin) return null;

  const q = search.trim().toLowerCase();
  const matches = (u: PendingUser) =>
    !q ||
    (u.display_name ?? "").toLowerCase().includes(q) ||
    (u.email ?? "").toLowerCase().includes(q) ||
    (u.telegram_username ?? "").toLowerCase().includes(q) ||
    (u.organization ?? "").toLowerCase().includes(q);

  const pending = users.filter(u => !u.is_approved && matches(u));
  const approved = users.filter(u => u.is_approved && matches(u));

  return (
    <div className="border-t border-border pt-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-medium">Управление пользователями</h2>
          <Badge variant="secondary" className="text-xs">{users.length}</Badge>
        </div>
        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: имя, email, @tg, организация"
            className="h-8 pl-8 text-xs"
          />
        </div>
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
                <div key={u.id} className="p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {renderNameBlock(u)}
                      {renderUserMeta(u)}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {renderDeptSelect(u)}
                      <Button size="sm" onClick={() => handleToggleApproval(u.id, true)} className="gap-1">
                        <UserCheck className="h-3.5 w-3.5" />
                        Одобрить
                      </Button>
                    </div>
                  </div>
                  {renderExtraFields(u)}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Активные пользователи ({approved.length})
            </p>
            {approved.map(u => (
              <div key={u.id} className="p-3 rounded-lg border border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {renderNameBlock(u)}
                    {renderUserMeta(u)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {renderDeptSelect(u)}
                    <Badge variant="secondary" className="text-xs">Активен</Badge>
                    <Button size="sm" variant="outline" onClick={() => handleToggleApproval(u.id, false)} className="gap-1">
                      <UserX className="h-3.5 w-3.5" />
                      Деактивировать
                    </Button>
                  </div>
                </div>
                {renderExtraFields(u)}
              </div>
            ))}
          </div>

          {pending.length === 0 && approved.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {q ? `Ничего не найдено по запросу «${search}»` : "Нет пользователей"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
