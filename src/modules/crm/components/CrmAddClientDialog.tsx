import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, User as UserIcon, X } from "lucide-react";
import { useTaskMutations, useAvailableUsers } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import { toast } from "sonner";

/**
 * Короткая форма создания клиента в CRM: только имя + ответственный (менеджер).
 * Остальные поля (контакты, город, ранг) заполняются позже в карточке клиента.
 * Под капотом — addTask({ task_type: "crm" }), который создаёт запись клиента,
 * карточку воронки и шаги-сабтаски.
 */
export default function CrmAddClientDialog({
  open,
  onOpenChange,
  partnerOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Если true — создаётся только запись клиента в справочнике, без воронки и шагов. */
  partnerOnly?: boolean;
}) {
  const { addTask } = useTaskMutations();
  const { data: users = [] } = useAvailableUsers();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const managerName = useMemo(
    () => users.find((u) => u.id === managerId)?.display_name ?? null,
    [users, managerId],
  );

  const reset = () => {
    setName("");
    setManagerId(null);
    setPickerOpen(false);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Введите имя клиента");
      return;
    }
    setSaving(true);
    try {
      if (partnerOnly) {
        // Только справочник: создаём/находим клиента, назначаем менеджера. Без воронки и шагов.
        const { data: clientId, error: upsertErr } = await supabase
          .rpc("upsert_client_by_name", { _name: trimmed, _user_id: user!.id });
        if (upsertErr) throw upsertErr;
        if (clientId && managerId) {
          await supabase.from("client_assignments").upsert(
            { user_id: user!.id, client_id: clientId as string, manager_id: managerId } as any,
            { onConflict: "user_id,client_id" },
          );
          await supabase.from("clients").update({ manager_id: managerId }).eq("id", clientId as string);
        }
        await qc.invalidateQueries({ queryKey: ["crm-partners"] });
        toast.success("Партнёр добавлен");
        reset();
        onOpenChange(false);
        return;
      }
      await addTask.mutateAsync({
        title: trimmed,
        task_type: "crm",
        client_name: trimmed,
        assigned_to: managerId,
      });
      toast.success("Клиент добавлен");
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Ошибка: " + (e?.message || "не удалось создать клиента"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {partnerOnly ? "Добавить партнёра" : "Добавить клиента"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {partnerOnly ? "Название партнёра" : "Имя клиента"}
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, АЗС Лукойл"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim() && !saving) handleSubmit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Ответственный</label>
            <AssigneePicker
              users={users}
              current={{ kind: managerId ? "user" : null, id: managerId }}
              onSelect={(sel: AssigneeSelection) => {
                setManagerId(sel.kind === "user" ? sel.id : null);
                setPickerOpen(false);
              }}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              hideDepartment
              hideContractor
              side="bottom"
              trigger={
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span className={managerName ? "" : "text-muted-foreground"}>
                    {managerName || "Не назначен"}
                  </span>
                  {managerId && (
                    <X
                      className="ml-auto h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setManagerId(null);
                      }}
                    />
                  )}
                </button>
              }
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Создать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}