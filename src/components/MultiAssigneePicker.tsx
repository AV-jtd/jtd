import { useState, useMemo, useCallback } from "react";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Profile } from "@/hooks/useTasks";

interface Props {
  users: Profile[];
  excludeIds?: string[];
  /** Callback receives the resolved list of user IDs (deduped, excludes already excludeIds). */
  onSelectUsers: (userIds: string[], meta: { source: AssigneeSelection; addedCount: number; sourceLabel?: string }) => void | Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
  hideDepartment?: boolean;
  hideContractor?: boolean;
  /** Show "Добавлено N человек" toast when expanding department/contractor. */
  showExpansionToast?: boolean;
}

/**
 * Drop-in replacement for UserPicker that supports adding by Department or Contractor.
 * - Selecting a User → returns [userId]
 * - Selecting a Department → resolves to all members of that department (via user_departments + head_user_id)
 * - Selecting a Contractor → resolves to all profiles with that contractor_id
 * Already-present userIds (excludeIds) are filtered out before invoking the callback.
 */
export default function MultiAssigneePicker({
  users,
  excludeIds = [],
  onSelectUsers,
  open,
  onOpenChange,
  trigger,
  side = "left",
  hideDepartment,
  hideContractor,
  showExpansionToast = true,
}: Props) {
  const [resolving, setResolving] = useState(false);
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const resolveDepartment = useCallback(async (departmentId: string): Promise<{ ids: string[]; name: string }> => {
    const [membersRes, deptRes, dirRes] = await Promise.all([
      supabase.from("user_departments").select("user_id").eq("department_id", departmentId),
      supabase.from("departments").select("name, head_user_id").eq("id", departmentId).maybeSingle(),
      supabase.from("department_directors").select("director_user_id").eq("department_id", departmentId),
    ]);
    const set = new Set<string>();
    (membersRes.data ?? []).forEach((r: any) => r.user_id && set.add(r.user_id));
    (dirRes.data ?? []).forEach((r: any) => r.director_user_id && set.add(r.director_user_id));
    if (deptRes.data?.head_user_id) set.add(deptRes.data.head_user_id);
    return { ids: Array.from(set), name: deptRes.data?.name ?? "Отдел" };
  }, []);

  const resolveContractor = useCallback(async (contractorId: string): Promise<{ ids: string[]; name: string }> => {
    const [profRes, contrRes] = await Promise.all([
      supabase.from("profiles").select("id").eq("contractor_id", contractorId),
      supabase.from("contractors").select("name").eq("id", contractorId).maybeSingle(),
    ]);
    const ids = (profRes.data ?? []).map((p: any) => p.id).filter(Boolean);
    return { ids, name: contrRes.data?.name ?? "Подрядчик" };
  }, []);

  const handleSelect = useCallback(async (sel: AssigneeSelection) => {
    if (!sel.id || !sel.kind) return;
    if (resolving) return;

    if (sel.kind === "user") {
      if (excludeSet.has(sel.id)) {
        toast({ description: "Этот участник уже добавлен" });
        return;
      }
      await onSelectUsers([sel.id], { source: sel, addedCount: 1 });
      return;
    }

    setResolving(true);
    try {
      const { ids: rawIds, name } = sel.kind === "department"
        ? await resolveDepartment(sel.id)
        : await resolveContractor(sel.id);
      const fresh = rawIds.filter((id) => !excludeSet.has(id));
      if (fresh.length === 0) {
        toast({
          description: rawIds.length === 0
            ? `В «${name}» нет сотрудников`
            : `Все сотрудники из «${name}» уже добавлены`,
        });
        return;
      }
      await onSelectUsers(fresh, { source: sel, addedCount: fresh.length, sourceLabel: name });
      if (showExpansionToast) {
        toast({
          description: `Добавлено ${fresh.length} ${pluralize(fresh.length)} из «${name}»`,
        });
      }
    } catch (e: any) {
      console.error("[MultiAssigneePicker] resolve failed", e);
      toast({ description: "Не удалось получить состав", variant: "destructive" });
    } finally {
      setResolving(false);
    }
  }, [resolving, excludeSet, onSelectUsers, resolveDepartment, resolveContractor, showExpansionToast]);

  return (
    <AssigneePicker
      users={users}
      excludeUserIds={excludeIds}
      onSelect={handleSelect}
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      side={side}
      hideDepartment={hideDepartment}
      hideContractor={hideContractor}
      allowClear={false}
    />
  );
}

function pluralize(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "человека";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "человек";
  return "человек";
}