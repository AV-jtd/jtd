import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ShieldCheck, Search, ArrowUpDown, LayoutGrid, ChevronDown, Building2, Users, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useContractors } from "@/hooks/useContractors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDepartments } from "@/hooks/useDepartments";
import { useAllUserDepartments } from "@/hooks/useOrgStructure";
import { UserCard } from "./admin/UserCard";
import { AuditHistoryDialog } from "./admin/AuditHistoryDialog";
import { EditCredentialsDialog } from "./admin/EditCredentialsDialog";
import type { AdminUser, Department, ClientLite, SortMode, GroupMode } from "./admin/types";

export default function AdminApproval() {
  const { isAdmin, user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Filters / sort / group
  const [search, setSearch] = useState("");
  const [showOnlyNoDept, setShowOnlyNoDept] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDept, setBulkDept] = useState<string>("__none");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Inline name editing
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // Audit history dialog
  const [historyUser, setHistoryUser] = useState<AdminUser | null>(null);
  const [credsUser, setCredsUser] = useState<AdminUser | null>(null);

  const { data: contractors = [] } = useContractors();
  const { data: userDeps = [] } = useAllUserDepartments();
  // Единый кеш отделов — синхронизирован с OrgStructurePanel.
  // Когда там создают/переименовывают отдел или меняют руководителя,
  // карточки в этом списке тоже обновляются.
  const { data: departmentsRaw = [] } = useDepartments();
  const departments = departmentsRaw as unknown as Department[];
  const { data: clients = [] } = useQuery<ClientLite[]>({
    queryKey: ["clients", "lite-for-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("id, name").order("name");
      if (error) throw error;
      // Дубли по имени уже невозможны: уникальный индекс clients_lower_name_uniq.
      return (data ?? []) as ClientLite[];
    },
    enabled: !!isAdmin,
    staleTime: 60_000,
  });

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, email, telegram_username, created_at, is_approved, department_id, organization, contractor_id, client_id, deleted_at, deleted_by")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    if (profiles) setUsers(profiles as AdminUser[]);
    if (roles) setAdminIds(new Set((roles as { user_id: string }[]).map(r => r.user_id)));
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  // Если в OrgStructurePanel поменяли head или создали/удалили отдел —
  // перечитываем профили: триггер sync_department_head_membership мог
  // переместить главу в этот отдел, а нам нужно показать актуальное.
  const headSnapshot = useMemo(
    () => departments.map(d => `${d.id}:${d.head_user_id ?? ""}`).join("|"),
    [departments],
  );
  useEffect(() => {
    if (!isAdmin || loading) return;
    // Лёгкая перезагрузка только профилей
    supabase
      .from("profiles")
      .select("id, display_name, email, telegram_username, created_at, is_approved, department_id, organization, contractor_id, client_id, deleted_at, deleted_by")
      .order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setUsers(data as AdminUser[]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headSnapshot, isAdmin]);

  const isProtected = (u: AdminUser) => adminIds.has(u.id);

  // ---- mutations ----
  const handleToggleApproval = async (userId: string, approve: boolean) => {
    const u = users.find(x => x.id === userId);
    if (!approve && u && isProtected(u)) {
      toast.error("Нельзя деактивировать администратора");
      return;
    }
    const { error } = await supabase.from("profiles").update({ is_approved: approve } as any).eq("id", userId);
    if (error) return toast.error("Ошибка: " + error.message);
    toast.success(approve ? "Пользователь активирован" : "Пользователь деактивирован");
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_approved: approve } : u));
  };

  const handleDepartmentChange = async (userId: string, deptId: string | null) => {
    const { error } = await supabase.from("profiles").update({ department_id: deptId } as any).eq("id", userId);
    if (error) return toast.error("Не удалось обновить отдел: " + error.message);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, department_id: deptId } : u));
    toast.success(deptId ? "Отдел обновлён" : "Отдел снят");
  };

  // Toggle "head of department" for the user's current department.
  const handleToggleHead = async (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (!u || !u.department_id) {
      toast.error("Сначала назначьте пользователю отдел");
      return;
    }
    const dept = departments.find(d => d.id === u.department_id);
    if (!dept) return;
    const isHead = dept.head_user_id === userId;
    const newHead = isHead ? null : userId;
    const { error } = await supabase
      .from("departments")
      .update({ head_user_id: newHead } as any)
      .eq("id", dept.id);
    if (error) return toast.error("Не удалось обновить главу: " + error.message);
    // Инвалидируем общий кеш отделов — это синхронизирует и карточки,
    // и панель «Оргструктура» наверху страницы.
    qc.invalidateQueries({ queryKey: ["departments"] });
    // DB-триггер sync_department_head_membership гарантирует, что новый глава
    // привязан к этому отделу в profiles. Синхронизируем локальный стейт,
    // чтобы карточка/группировка/фильтр «без отдела» обновились мгновенно.
    if (newHead) {
      setUsers(prev => prev.map(x => x.id === userId ? { ...x, department_id: dept.id } : x));
    }
    toast.success(isHead ? "Снят как глава отдела" : `Назначен главой: ${dept.name}`);
  };

  const updateUserField = async (userId: string, patch: Partial<AdminUser>) => {
    const { error } = await supabase.from("profiles").update(patch as any).eq("id", userId);
    if (error) return toast.error("Не удалось сохранить: " + error.message);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...patch } : u));
  };

  const deleteUser = async (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (u && isProtected(u)) { toast.error("Нельзя удалить администратора"); return; }
    if (userId === currentUser?.id) { toast.error("Нельзя удалить себя"); return; }
    const { error } = await supabase.rpc("admin_soft_delete_user" as any, { target_user_id: userId } as any);
    if (error) return toast.error("Не удалось удалить: " + error.message);
    toast.success("Пользователь помечен удалённым (можно восстановить)");
    setUsers(prev => prev.map(x => x.id === userId
      ? { ...x, deleted_at: new Date().toISOString(), deleted_by: currentUser?.id ?? null, is_approved: false }
      : x));
    setSelected(prev => { const n = new Set(prev); n.delete(userId); return n; });
  };

  const restoreUser = async (userId: string) => {
    const { error } = await supabase.rpc("admin_restore_user" as any, { target_user_id: userId } as any);
    if (error) return toast.error("Не удалось восстановить: " + error.message);
    toast.success("Пользователь восстановлен");
    setUsers(prev => prev.map(x => x.id === userId
      ? { ...x, deleted_at: null, deleted_by: null, is_approved: true }
      : x));
  };

  const hardDeleteUser = async (userId: string) => {
    const u = users.find(x => x.id === userId);
    if (u && isProtected(u)) { toast.error("Нельзя удалить администратора"); return; }
    if (userId === currentUser?.id) { toast.error("Нельзя удалить себя"); return; }
    const { error } = await supabase.rpc("admin_hard_delete_user" as any, { target_user_id: userId } as any);
    if (error) return toast.error("Не удалось удалить навсегда: " + error.message);
    toast.success("Пользователь удалён навсегда");
    setUsers(prev => prev.filter(u => u.id !== userId));
    setSelected(prev => { const n = new Set(prev); n.delete(userId); return n; });
  };

  // Inline name edit
  const startEditName = (u: AdminUser) => { setEditingNameId(u.id); setEditingNameValue(u.display_name ?? ""); };
  const saveName = async (userId: string) => {
    const v = editingNameValue.trim() || null;
    await updateUserField(userId, { display_name: v });
    setEditingNameId(null);
    toast.success("Имя обновлено");
  };

  // Bulk
  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const clearSelection = () => setSelected(new Set());
  const selectAll = (ids: string[]) => setSelected(prev => {
    const n = new Set(prev);
    ids.forEach(id => n.add(id));
    return n;
  });

  const applyBulkDept = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const deptId = bulkDept === "__none" ? null : bulkDept;
    const ids = Array.from(selected);
    const { error } = await supabase.rpc("admin_set_users_department" as any, { user_ids: ids, dept_id: deptId } as any);
    setBulkBusy(false);
    if (error) return toast.error("Ошибка: " + error.message);
    setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, department_id: deptId } : u));
    toast.success(`Обновлено: ${ids.length}`);
    clearSelection();
  };

  // ---- filtering / sorting / grouping ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users.filter(u => {
      // Удалённые рендерятся в отдельной секции — здесь их прячем
      if (u.deleted_at) return false;
      if (showOnlyNoDept && u.department_id) return false;
      if (!q) return true;
      return (
        (u.display_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.telegram_username ?? "").toLowerCase().includes(q) ||
        (u.organization ?? "").toLowerCase().includes(q)
      );
    });

    const deptName = (id: string | null) => id ? departments.find(d => d.id === id)?.name ?? "" : "";

    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case "date_desc": return b.created_at.localeCompare(a.created_at);
        case "date_asc": return a.created_at.localeCompare(b.created_at);
        case "name_asc": return (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? "", "ru");
        case "department": return deptName(a.department_id).localeCompare(deptName(b.department_id), "ru");
      }
    });
    return list;
  }, [users, search, showOnlyNoDept, sortMode, departments]);

  const pending = filtered.filter(u => !u.is_approved);
  const approved = filtered.filter(u => u.is_approved);

  // Удалённые — отдельная коллекция, отфильтрованная только поиском
  const deletedUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => !!u.deleted_at)
      .filter(u => {
        if (!q) return true;
        return (
          (u.display_name ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.telegram_username ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
  }, [users, search]);

  const groupedApproved = useMemo(() => {
    if (groupMode !== "department") return null;
    const groups = new Map<string, AdminUser[]>();
    approved.forEach(u => {
      const key = u.department_id ?? "__none";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(u);
    });
    const ordered: { id: string; name: string; users: AdminUser[] }[] = [];
    departments.forEach(d => {
      if (groups.has(d.id)) ordered.push({ id: d.id, name: d.name, users: groups.get(d.id)! });
    });
    if (groups.has("__none")) ordered.push({ id: "__none", name: "Без отдела", users: groups.get("__none")! });
    return ordered;
  }, [approved, departments, groupMode]);

  // Stats for filters bar
  const noDeptCount = users.filter(u => u.is_approved && !u.department_id).length;

  // Map: user_id -> доп. (не-primary) отделы
  const extrasByUser = useMemo(() => {
    const m = new Map<string, string[]>();
    userDeps.forEach((ud) => {
      if (ud.is_primary) return;
      const arr = m.get(ud.user_id) ?? [];
      arr.push(ud.department_id);
      m.set(ud.user_id, arr);
    });
    return m;
  }, [userDeps]);

  if (!isAdmin) return null;

  const renderCard = (u: AdminUser) => (
    <UserCard
      key={u.id}
      user={u}
      isProtectedAdmin={isProtected(u)}
      selected={selected.has(u.id)}
      onToggleSelect={toggleSelect}
      departments={departments}
      contractors={contractors}
      clients={clients}
      extraDeptIds={extrasByUser.get(u.id) ?? []}
      editingNameId={editingNameId}
      editingNameValue={editingNameValue}
      onStartEditName={startEditName}
      onChangeNameValue={setEditingNameValue}
      onSaveName={saveName}
      onCancelEditName={() => setEditingNameId(null)}
      onApprove={handleToggleApproval}
      onDepartmentChange={handleDepartmentChange}
      onToggleHead={handleToggleHead}
      onUpdateField={updateUserField}
      onDelete={deleteUser}
      onRestore={restoreUser}
      onHardDelete={hardDeleteUser}
      onShowHistory={setHistoryUser}
      onEditCredentials={setCredsUser}
    />
  );

  return (
    <div className="border-t border-border pt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-medium">Управление пользователями</h2>
        <Badge variant="secondary" className="text-xs">{users.length}</Badge>
        {noDeptCount > 0 && (
          <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3 w-3" /> {noDeptCount} без отдела
          </Badge>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: имя, email, @tg, организация"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Button
          size="sm"
          variant={showOnlyNoDept ? "default" : "outline"}
          onClick={() => setShowOnlyNoDept(v => !v)}
          className="h-8 gap-1 text-xs"
        >
          <Building2 className="h-3.5 w-3.5" /> Без отдела
        </Button>

        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <ArrowUpDown className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc" className="text-xs">Сначала новые</SelectItem>
            <SelectItem value="date_asc" className="text-xs">Сначала старые</SelectItem>
            <SelectItem value="name_asc" className="text-xs">По алфавиту</SelectItem>
            <SelectItem value="department" className="text-xs">По отделу</SelectItem>
          </SelectContent>
        </Select>

        <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <LayoutGrid className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">Без группировки</SelectItem>
            <SelectItem value="department" className="text-xs">По отделам</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/30 bg-primary/5 flex-wrap">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Выбрано: {selected.size}</span>
          <Select value={bulkDept} onValueChange={setBulkDept}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <Building2 className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Отдел для назначения" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" className="text-xs text-muted-foreground">— Снять отдел —</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={applyBulkDept} disabled={bulkBusy} className="h-8 text-xs">
            {bulkBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Применить
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="h-8 text-xs">Отмена</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Ожидают подтверждения ({pending.length})</p>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectAll(pending.map(u => u.id))}>
                  Выбрать всех
                </Button>
              </div>
              {pending.map(renderCard)}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Активные пользователи ({approved.length})</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => selectAll(approved.map(u => u.id))}>
                Выбрать всех
              </Button>
            </div>

            {groupedApproved ? (
              <div className="space-y-2">
                {groupedApproved.map(g => (
                  <Collapsible key={g.id} defaultOpen={g.id === "__none"}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90" />
                      <span className="text-sm font-medium">{g.name}</span>
                      <Badge variant="secondary" className="text-xs">{g.users.length}</Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-2 pl-2">
                      {g.users.map(renderCard)}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            ) : (
              approved.map(renderCard)
            )}
          </div>

          {pending.length === 0 && approved.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {search || showOnlyNoDept ? "Ничего не найдено по фильтрам" : "Нет пользователей"}
            </p>
          )}

          {deletedUsers.length > 0 && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors mt-4 border-t border-border pt-4">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=closed]:-rotate-90" />
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Удалённые пользователи</span>
                <Badge variant="secondary" className="text-xs">{deletedUsers.length}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  Можно восстановить или удалить навсегда
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                {deletedUsers.map(renderCard)}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}

      <AuditHistoryDialog user={historyUser} onClose={() => setHistoryUser(null)} />
    </div>
  );
}
