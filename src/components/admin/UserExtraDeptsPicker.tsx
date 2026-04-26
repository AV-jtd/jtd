import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Layers } from "lucide-react";
import { useSetUserDepartments } from "@/hooks/useOrgStructure";
import { toast } from "sonner";
import type { Department } from "./types";

/**
 * Управление дополнительными отделами пользователя (M2M `user_departments`).
 * Primary-отдел берётся из карточки (selectedPrimaryId) и редактируется отдельным
 * селектом в UserCard — здесь только extras.
 */
export function UserExtraDeptsPicker({
  userId,
  departments,
  primaryDeptId,
  extraDeptIds,
}: {
  userId: string;
  departments: Department[];
  primaryDeptId: string | null;
  extraDeptIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(extraDeptIds);
  const setUserDepts = useSetUserDepartments();

  const toggle = (id: string) => {
    setDraft((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  };

  const handleSave = async () => {
    try {
      await setUserDepts.mutateAsync({
        userId,
        primaryDeptId,
        extraDeptIds: draft.filter((id) => id !== primaryDeptId),
      });
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось сохранить");
    }
  };

  const count = extraDeptIds.length;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(extraDeptIds);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          title="Дополнительные отделы (кросс-функциональное участие)"
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Доп. отделы</span>
          {count > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="text-[11px] text-muted-foreground mb-2">
          Дополнительные отделы, в которых участвует пользователь.
          Основной отдел задаётся селектом «Отдел» слева.
        </div>
        <div className="max-h-56 overflow-auto space-y-1 border-t border-border pt-2">
          {departments
            .filter((d) => d.id !== primaryDeptId)
            .map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted"
              >
                <Checkbox
                  checked={draft.includes(d.id)}
                  onCheckedChange={() => toggle(d.id)}
                />
                <span className="truncate">{d.name}</span>
              </label>
            ))}
          {departments.filter((d) => d.id !== primaryDeptId).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Нет других отделов
            </p>
          )}
        </div>
        <div className="flex justify-end gap-1.5 mt-3">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleSave} disabled={setUserDepts.isPending}>
            {setUserDepts.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Сохранить
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}