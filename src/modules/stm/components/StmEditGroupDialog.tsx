import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, UserCog, Users, X } from "lucide-react";
import UserPicker from "@/components/UserPicker";
import MultiAssigneePicker from "@/components/MultiAssigneePicker";
import { useAvailableUsers, type Profile } from "@/hooks/useTasks";
import {
  useUpdateStmGroupMeta,
  useSetStmGroupManager,
  useAddStmGroupParticipants,
  type StmGroupField,
} from "../hooks/useStmProjects";
import { getInitials } from "@/lib/initials";

const FIELD_LABELS: Record<StmGroupField, string> = {
  retailer: "Сеть",
  brand: "Бренд",
  drop: "Дроп / контракт",
  project: "Проект",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Which meta dimension this header represents. */
  field: StmGroupField;
  /** Current value (group label). */
  currentValue: string;
  /** All SKU (task_group) ids inside this group. */
  groupIds: string[];
  /** All existing values of this dimension (для подсказки объединения). */
  existingValues: string[];
  /** Current manager_id if all SKUs share one (else null). */
  currentManagerId: string | null;
}

export default function StmEditGroupDialog({
  open, onOpenChange, field, currentValue, groupIds, existingValues, currentManagerId,
}: Props) {
  const { data: users = [] } = useAvailableUsers();
  const [name, setName] = useState(currentValue);
  const [managerId, setManagerId] = useState<string | null>(currentManagerId);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [mgrOpen, setMgrOpen] = useState(false);
  const [partOpen, setPartOpen] = useState(false);

  const updateMeta = useUpdateStmGroupMeta();
  const setManager = useSetStmGroupManager();
  const addParticipants = useAddStmGroupParticipants();

  useEffect(() => {
    if (open) {
      setName(currentValue);
      setManagerId(currentManagerId);
      setParticipantIds([]);
    }
  }, [open, currentValue, currentManagerId]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach(u => m.set(u.id, u.display_name || u.email || "—"));
    return m;
  }, [users]);

  const trimmed = name.trim();
  const isRename = trimmed && trimmed.toLowerCase() !== currentValue.trim().toLowerCase();
  const willMerge = isRename && existingValues.some(
    v => v.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const managerChanged = (managerId ?? null) !== (currentManagerId ?? null);

  const busy = updateMeta.isPending || setManager.isPending || addParticipants.isPending;

  const submit = async () => {
    if (isRename) {
      await updateMeta.mutateAsync({ groupIds, field, value: trimmed });
    }
    if (managerChanged) {
      await setManager.mutateAsync({ groupIds, managerId });
    }
    if (participantIds.length) {
      await addParticipants.mutateAsync({ groupIds, userIds: participantIds });
    }
    onOpenChange(false);
  };

  const managerName = managerId ? nameById.get(managerId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Редактирование группы</DialogTitle>
          <DialogDescription>
            {FIELD_LABELS[field]} · применяется ко всем SKU группы ({groupIds.length})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Name / merge */}
          <div>
            <Label htmlFor="stm-grp-name" className="text-xs">Название ({FIELD_LABELS[field]})</Label>
            <Input
              id="stm-grp-name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
            {willMerge && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <Info className="h-3.5 w-3.5 mt-px shrink-0" />
                Такая группа уже есть → {groupIds.length} SKU будут объединены в неё.
              </p>
            )}
          </div>

          {/* Manager */}
          <div>
            <Label className="text-xs flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5" /> Ответственный менеджер</Label>
            <div className="flex items-center gap-2 mt-1">
              <UserPicker
                users={users}
                open={mgrOpen}
                onOpenChange={setMgrOpen}
                onSelect={(u: Profile) => setManagerId(u.id)}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="h-8">
                    {managerName || "Выбрать…"}
                  </Button>
                }
              />
              {managerId && (
                <button
                  type="button"
                  onClick={() => setManagerId(null)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Снять"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Participants */}
          <div>
            <Label className="text-xs flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Добавить участников</Label>
            <div className="flex items-center flex-wrap gap-1.5 mt-1">
              {participantIds.map(id => (
                <span key={id} className="inline-flex items-center gap-1 text-[11px] bg-muted rounded-full pl-2 pr-1 py-0.5">
                  {nameById.get(id) ? getInitials(nameById.get(id)) : "—"}
                  <button type="button" onClick={() => setParticipantIds(prev => prev.filter(x => x !== id))} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <MultiAssigneePicker
                users={users}
                excludeIds={participantIds}
                open={partOpen}
                onOpenChange={setPartOpen}
                onSelectUsers={(ids) => setParticipantIds(prev => Array.from(new Set([...prev, ...ids])))}
                trigger={
                  <Button type="button" variant="outline" size="sm" className="h-8">
                    + участник
                  </Button>
                }
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Добавятся на все этапы каждого SKU группы (без дублей).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</Button>
          <Button
            onClick={submit}
            disabled={busy || (!isRename && !managerChanged && participantIds.length === 0)}
          >
            {busy ? "Сохранение…" : willMerge ? "Объединить" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}