import { useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Plus, Trash2, Users, Crown, Shield, Loader2, X, MoveVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from "@/hooks/useDepartments";
import { useAvailableUsers } from "@/hooks/useTasks";
import {
  useAllUserDepartments,
  useDepartmentDirectors,
  useUpdateDepartmentParent,
  useAddDepartmentDirector,
  useRemoveDepartmentDirector,
} from "@/hooks/useOrgStructure";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Админ-панель «Оргструктура».
 *
 * UI ограничен 3 уровнями (Дирекция → Отдел → Подотдел), хотя БД допускает N.
 *  - дерево с inline-добавлением подразделения,
 *  - назначение head (один) и доп. кураторов (директоров) — кружки,
 *  - привязка пользователя к доп. отделам (M2M) живёт в карточке пользователя
 *    в разделе «Управление пользователями» (кнопка «Доп. отделы»).
 */
export default function OrgStructurePanel() {
  const { data: departments = [], isLoading } = useDepartments();
  const { data: users = [] } = useAvailableUsers();
  const { data: userDeps = [] } = useAllUserDepartments();
  const { data: directors = [] } = useDepartmentDirectors();
  const create = useCreateDepartment();
  const updateParent = useUpdateDepartmentParent();
  const updateDept = useUpdateDepartment();
  const removeDept = useDeleteDepartment();
  const addDirector = useAddDepartmentDirector();
  const removeDirector = useRemoveDepartmentDirector();

  // Группируем по parent
  const byParent = useMemo(() => {
    const m = new Map<string | null, typeof departments>();
    departments.forEach((d) => {
      const k = (d as any).parent_department_id ?? null;
      const arr = m.get(k) ?? [];
      arr.push(d);
      m.set(k, arr);
    });
    return m;
  }, [departments]);

  const usersByDept = useMemo(() => {
    const m = new Map<string, { userId: string; isPrimary: boolean }[]>();
    userDeps.forEach((ud) => {
      const arr = m.get(ud.department_id) ?? [];
      arr.push({ userId: ud.user_id, isPrimary: ud.is_primary });
      m.set(ud.department_id, arr);
    });
    return m;
  }, [userDeps]);

  const directorsByDept = useMemo(() => {
    const m = new Map<string, string[]>();
    directors.forEach((d) => {
      const arr = m.get(d.department_id) ?? [];
      arr.push(d.director_user_id);
      m.set(d.department_id, arr);
    });
    return m;
  }, [directors]);

  const [newRootName, setNewRootName] = useState("");

  const handleCreateRoot = async () => {
    if (!newRootName.trim()) return;
    await create.mutateAsync({ name: newRootName });
    setNewRootName("");
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-4">
      {/* Создание новой Дирекции */}
      <div className="flex gap-2">
        <Input
          value={newRootName}
          onChange={(e) => setNewRootName(e.target.value)}
          placeholder="Новая Дирекция (1-й уровень)"
          className="text-sm"
          onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoot(); }}
        />
        <Button onClick={handleCreateRoot} disabled={!newRootName.trim() || create.isPending} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Дирекция
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Глубина — 3 уровня: <b>Дирекция → Отдел → Подотдел</b>. <Crown className="inline h-3 w-3 text-amber-500" /> руководитель отдела;{" "}
        <Shield className="inline h-3 w-3 text-violet-500" /> со-руководители (равные права видимости).
      </div>

      <div className="space-y-1.5">
        {roots.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Пока нет ни одной дирекции. Создайте первую сверху.</p>
        )}
        {roots.map((d) => (
          <DeptRow
            key={d.id}
            dept={d as any}
            depth={0}
            byParent={byParent}
            allDepartments={departments as any}
            users={users}
            usersByDept={usersByDept}
            directorsByDept={directorsByDept}
            onCreateChild={async (parentId, name) => {
              const created = await create.mutateAsync({ name });
              if (created?.id) await updateParent.mutateAsync({ id: created.id, parent_department_id: parentId });
            }}
            onSetHead={(deptId, userId) => updateDept.mutateAsync({ id: deptId, head_user_id: userId })}
            onRename={(deptId, name) => updateDept.mutateAsync({ id: deptId, name })}
            onAddDirector={(deptId, userId) => addDirector.mutateAsync({ departmentId: deptId, userId })}
            onRemoveDirector={(deptId, userId) => removeDirector.mutateAsync({ departmentId: deptId, userId })}
            onMove={(deptId, parentId) => updateParent.mutateAsync({ id: deptId, parent_department_id: parentId })}
            onDelete={async (deptId) => {
              if (!confirm("Удалить отдел? Подотделы и привязки к пользователям тоже отвяжутся.")) return;
              await removeDept.mutateAsync(deptId);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type AnyDept = { id: string; name: string; head_user_id: string | null; parent_department_id?: string | null; color?: string | null };
type AnyUser = { id: string; display_name?: string | null; email?: string | null };

interface DeptRowProps {
  dept: AnyDept;
  depth: number;
  byParent: Map<string | null, AnyDept[]>;
  allDepartments: AnyDept[];
  users: AnyUser[];
  usersByDept: Map<string, { userId: string; isPrimary: boolean }[]>;
  directorsByDept: Map<string, string[]>;
  onCreateChild: (parentId: string, name: string) => Promise<void>;
  onSetHead: (deptId: string, userId: string | null) => Promise<unknown>;
  onRename: (deptId: string, name: string) => Promise<unknown>;
  onAddDirector: (deptId: string, userId: string) => Promise<unknown>;
  onRemoveDirector: (deptId: string, userId: string) => Promise<unknown>;
  onMove: (deptId: string, parentId: string | null) => Promise<unknown>;
  onDelete: (deptId: string) => Promise<void>;
}

function DeptRow(p: DeptRowProps) {
  const { dept, depth, byParent, users, usersByDept, directorsByDept } = p;
  const children = byParent.get(dept.id) ?? [];
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(dept.name);

  const headUser = dept.head_user_id ? users.find((u) => u.id === dept.head_user_id) : null;
  const memberCount = (usersByDept.get(dept.id) ?? []).length;
  const dirIds = directorsByDept.get(dept.id) ?? [];

  const canAddChild = depth < 2; // 3 уровня

  const handleAddChild = async () => {
    if (!childName.trim()) return;
    await p.onCreateChild(dept.id, childName.trim());
    setChildName("");
    setAdding(false);
    setOpen(true);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 hover:border-primary/40 transition-colors",
        )}
        style={{ marginLeft: depth * 20 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Развернуть"
        >
          {children.length > 0 ? (open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="inline-block w-3.5" />}
        </button>

        <Building2 className="h-4 w-4 text-primary shrink-0" />

        {editing ? (
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={async () => {
              setEditing(false);
              if (editName.trim() && editName !== dept.name) await p.onRename(dept.id, editName.trim());
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                setEditing(false);
                if (editName.trim() && editName !== dept.name) await p.onRename(dept.id, editName.trim());
              }
              if (e.key === "Escape") { setEditing(false); setEditName(dept.name); }
            }}
            className="h-6 text-sm w-[220px]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium truncate hover:underline"
          >
            {dept.name}
          </button>
        )}

        <Badge variant="outline" className="h-5 text-[10px] gap-0.5">
          {depth === 0 ? "Дирекция" : depth === 1 ? "Отдел" : "Подотдел"}
        </Badge>

        <span className="text-[11px] text-muted-foreground">{memberCount} чел.</span>

        {/* Head */}
        <div className="ml-auto flex items-center gap-1.5">
          <HeadPicker dept={dept} users={users} onSet={(uid) => p.onSetHead(dept.id, uid)} />

          {/* Directors (extra curators) */}
          <DirectorsPicker
            dept={dept}
            users={users}
            directorIds={dirIds}
            onAdd={(uid) => p.onAddDirector(dept.id, uid)}
            onRemove={(uid) => p.onRemoveDirector(dept.id, uid)}
          />

          <MoveParentPicker
            dept={dept}
            allDepartments={p.allDepartments}
            byParent={byParent}
            onMove={(parentId) => p.onMove(dept.id, parentId)}
          />

          {canAddChild && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAdding((v) => !v)} title="Добавить подразделение">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => p.onDelete(dept.id)} title="Удалить">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {adding && canAddChild && (
        <div className="flex gap-1.5 mt-1" style={{ marginLeft: (depth + 1) * 20 }}>
          <Input
            autoFocus
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder={depth === 0 ? "Название отдела" : "Название подотдела"}
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddChild();
              if (e.key === "Escape") { setAdding(false); setChildName(""); }
            }}
          />
          <Button size="sm" className="h-7" onClick={handleAddChild} disabled={!childName.trim()}>Создать</Button>
        </div>
      )}

      {open && children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map((c) => (
            <DeptRow key={c.id} {...p} dept={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HeadPicker({ dept, users, onSet }: { dept: AnyDept; users: AnyUser[]; onSet: (uid: string | null) => Promise<unknown> }) {
  const head = dept.head_user_id ? users.find((u) => u.id === dept.head_user_id) : null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = users.filter((u) => (u.display_name ?? u.email ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            head ? "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-amber-500/50",
          )}
          title="Руководитель отдела (head)"
        >
          <Crown className="h-3 w-3" />
          {head ? (head.display_name ?? head.email ?? "?") : "Руководитель"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск..." className="h-7 text-xs mb-2" />
        {head && (
          <button
            onClick={async () => { await onSet(null); setOpen(false); }}
            className="w-full text-left px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 mb-1"
          >
            Снять руководителя
          </button>
        )}
        <div className="max-h-64 overflow-auto">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={async () => { await onSet(u.id); setOpen(false); }}
              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted truncate"
            >
              {u.display_name ?? u.email}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DirectorsPicker({
  dept, users, directorIds, onAdd, onRemove,
}: {
  dept: AnyDept;
  users: AnyUser[];
  directorIds: string[];
  onAdd: (uid: string) => Promise<unknown>;
  onRemove: (uid: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const dirs = directorIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as AnyUser[];
  const filtered = users
    .filter((u) => !directorIds.includes(u.id) && u.id !== dept.head_user_id)
    .filter((u) => (u.display_name ?? u.email ?? "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 30);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            dirs.length > 0
              ? "border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
              : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-violet-500/50",
          )}
          title="Со-руководители (равные права видимости с head'ом)"
        >
          <Shield className="h-3 w-3" />
          {dirs.length > 0 ? `Со-рук.: ${dirs.length}` : "Со-руководитель"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        {dirs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {dirs.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                {u.display_name ?? u.email}
                <button onClick={() => onRemove(u.id)} className="hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Добавить со-руководителя..." className="h-7 text-xs mb-2" />
        <div className="max-h-64 overflow-auto">
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={async () => { await onAdd(u.id); setQ(""); }}
              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted truncate"
            >
              {u.display_name ?? u.email}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-xs text-muted-foreground p-2 text-center">Никого не нашлось</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function MoveParentPicker({
  dept,
  allDepartments,
  byParent,
  onMove,
}: {
  dept: AnyDept;
  allDepartments: AnyDept[];
  byParent: Map<string | null, AnyDept[]>;
  onMove: (parentId: string | null) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // Собираем id потомков (включая сам отдел) — туда переносить нельзя.
  const blocked = useMemo(() => {
    const set = new Set<string>([dept.id]);
    const walk = (id: string) => {
      const ch = byParent.get(id) ?? [];
      ch.forEach((c) => { set.add(c.id); walk(c.id); });
    };
    walk(dept.id);
    return set;
  }, [dept.id, byParent]);

  const candidates = allDepartments
    .filter((d) => !blocked.has(d.id))
    .filter((d) => (d.name ?? "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50);

  const currentParent = dept.parent_department_id
    ? allDepartments.find((d) => d.id === dept.parent_department_id)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
            "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary/50 hover:text-primary",
          )}
          title="Перенести в другую дирекцию/отдел"
        >
          <MoveVertical className="h-3 w-3" />
          Перенести
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="text-[11px] text-muted-foreground mb-1.5">
          Текущий родитель: <b>{currentParent?.name ?? "— верхний уровень —"}</b>
        </div>
        <button
          onClick={async () => { await onMove(null); setOpen(false); }}
          className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted mb-1 border border-dashed border-border"
        >
          ⬆ Сделать дирекцией (верхний уровень)
        </button>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск родителя..." className="h-7 text-xs mb-2" />
        <div className="max-h-64 overflow-auto">
          {candidates.map((d) => (
            <button
              key={d.id}
              onClick={async () => { await onMove(d.id); setOpen(false); }}
              className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted truncate"
            >
              {d.name}
            </button>
          ))}
          {candidates.length === 0 && <p className="text-xs text-muted-foreground p-2 text-center">Не найдено</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function UserMembershipBulk({
  users, departments, userDeps,
}: {
  users: AnyUser[];
  departments: AnyDept[];
  userDeps: { user_id: string; department_id: string; is_primary: boolean }[];
}) {
  const [search, setSearch] = useState("");
  const setUserDepts = useSetUserDepartments();
  const filtered = users
    .filter((u) => (u.display_name ?? u.email ?? "").toLowerCase().includes(search.toLowerCase()))
    .slice(0, 100);

  const userMap = useMemo(() => {
    const m = new Map<string, { primary: string | null; extras: string[] }>();
    userDeps.forEach((ud) => {
      const cur = m.get(ud.user_id) ?? { primary: null as string | null, extras: [] as string[] };
      if (ud.is_primary) cur.primary = ud.department_id;
      else cur.extras.push(ud.department_id);
      m.set(ud.user_id, cur);
    });
    return m;
  }, [userDeps]);

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Найти пользователя..."
        className="h-8 text-sm mb-2"
      />
      <div className="space-y-1 max-h-[420px] overflow-auto pr-1">
        {filtered.map((u) => {
          const cur = userMap.get(u.id) ?? { primary: null, extras: [] };
          return (
            <UserDeptRow
              key={u.id}
              user={u}
              departments={departments}
              primary={cur.primary}
              extras={cur.extras}
              onSave={async (primary, extras) => {
                await setUserDepts.mutateAsync({ userId: u.id, primaryDeptId: primary, extraDeptIds: extras });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function UserDeptRow({
  user, departments, primary, extras, onSave,
}: {
  user: AnyUser;
  departments: AnyDept[];
  primary: string | null;
  extras: string[];
  onSave: (primary: string | null, extras: string[]) => Promise<void>;
}) {
  const primaryDept = primary ? departments.find((d) => d.id === primary) : null;
  const [open, setOpen] = useState(false);
  const [draftPrimary, setDraftPrimary] = useState<string | null>(primary);
  const [draftExtras, setDraftExtras] = useState<string[]>(extras);
  const [saving, setSaving] = useState(false);

  const toggleExtra = (id: string) => {
    setDraftExtras((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(draftPrimary, draftExtras.filter((id) => id !== draftPrimary)); setOpen(false); }
    catch (e: any) { toast.error(e?.message ?? "Не удалось сохранить"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40">
      <span className="text-xs flex-1 truncate">{user.display_name ?? user.email ?? user.id.slice(0, 8)}</span>
      <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
        {primaryDept ? `★ ${primaryDept.name}` : "—"}
        {extras.length > 0 && ` · +${extras.length}`}
      </span>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraftPrimary(primary); setDraftExtras(extras); } }}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs">Изменить</Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="end">
          <div className="text-[11px] text-muted-foreground mb-2">
            ★ Основной отдел (для бейджа); ▢ — дополнительные.
          </div>
          <Select value={draftPrimary ?? "__none"} onValueChange={(v) => setDraftPrimary(v === "__none" ? null : v)}>
            <SelectTrigger className="h-8 text-xs mb-2">
              <SelectValue placeholder="Основной отдел" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none" className="text-xs text-muted-foreground">— Без отдела —</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="max-h-56 overflow-auto space-y-1 border-t border-border pt-2">
            {departments.filter((d) => d.id !== draftPrimary).map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted">
                <Checkbox
                  checked={draftExtras.includes(d.id)}
                  onCheckedChange={() => toggleExtra(d.id)}
                />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-1.5 mt-3">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}