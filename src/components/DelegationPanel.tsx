import { useState } from "react";
import { Building2, HardHat, Plus, Trash2, Pencil, Check, X, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from "@/hooks/useDepartments";
import { useContractors, useCreateContractor, useUpdateContractor, useDeleteContractor } from "@/hooks/useContractors";
import { useAvailableUsers } from "@/hooks/useTasks";

export default function DelegationPanel() {
  return (
    <div className="space-y-8">
      <DepartmentsSection />
      <ContractorsSection />
    </div>
  );
}

function DepartmentsSection() {
  const { data: departments = [] } = useDepartments();
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const remove = useDeleteDepartment();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name });
    setName("");
  };

  return (
    <div>
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-primary" />
        Отделы ({departments.length})
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Назначайте задачи целому отделу как метку. Уведомления не отправляются.
      </p>

      <div className="flex gap-2 mb-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название отдела (например, Маркетинг)"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="text-sm"
        />
        <Button onClick={handleAdd} disabled={!name.trim() || create.isPending} size="sm">
          <Plus className="h-4 w-4" />Добавить
        </Button>
      </div>

      <div className="space-y-1">
        {departments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Пока нет отделов</p>
        )}
        {departments.map(d => (
          <div key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <Building2 className="h-4 w-4 shrink-0" style={{ color: d.color ?? undefined }} />
            {editingId === d.id ? (
              <>
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingName.trim()) {
                      update.mutate({ id: d.id, name: editingName.trim() });
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 text-sm flex-1"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                  if (editingName.trim()) update.mutate({ id: d.id, name: editingName.trim() });
                  setEditingId(null);
                }}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium truncate">{d.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(d.id); setEditingName(d.name); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                  if (confirm(`Удалить отдел «${d.name}»? Привязки в задачах сбросятся.`)) {
                    remove.mutate(d.id);
                  }
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorsSection() {
  const { data: contractors = [] } = useContractors();
  const create = useCreateContractor();
  const update = useUpdateContractor();
  const remove = useDeleteContractor();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editOrg, setEditOrg] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({ name, organization: organization.trim() || null });
    setName("");
    setOrganization("");
  };

  return (
    <div>
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <HardHat className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        Подрядчики ({contractors.length})
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Внешние исполнители. Назначаются на задачу как метка, без уведомлений.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя / название"
          className="text-sm"
        />
        <Input
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="Организация (опционально)"
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="text-sm"
        />
        <Button onClick={handleAdd} disabled={!name.trim() || create.isPending} size="sm">
          <Plus className="h-4 w-4" />Добавить
        </Button>
      </div>

      <div className="space-y-1">
        {contractors.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Пока нет подрядчиков</p>
        )}
        {contractors.map(c => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <HardHat className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            {editingId === c.id ? (
              <>
                <Input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm flex-1"
                />
                <Input
                  value={editOrg}
                  onChange={(e) => setEditOrg(e.target.value)}
                  className="h-7 text-sm flex-1"
                  placeholder="Организация"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                  if (editName.trim()) {
                    update.mutate({ id: c.id, name: editName.trim(), organization: editOrg.trim() || null });
                  }
                  setEditingId(null);
                }}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  {c.organization && <div className="text-xs text-muted-foreground truncate">{c.organization}</div>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                  setEditOrg(c.organization ?? "");
                }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => {
                  if (confirm(`Удалить подрядчика «${c.name}»?`)) remove.mutate(c.id);
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
