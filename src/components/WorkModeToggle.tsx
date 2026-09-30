import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTaskGroups, type TaskGroup } from "@/hooks/useTasks";
import { toast } from "sonner";

/**
 * Переключатель «Поток» — проект с планом или операционный поток поручений.
 *
 * Зачем. «Продажи мечты» — 148 задач, ни одной вехи, поручения прилетают
 * репликами из Telegram. И такой поток, и проект с настоящим планом в базе
 * выглядели одинаково (`standard` + `container`), поэтому помощник в разговоре
 * разбирал поток по гантовым меркам: искал критический путь там, где его нет.
 *
 * Признак ставится руками и только руками. Выводить его из отсутствия вех
 * нельзя: настоящий проект в первый день тоже без вех, а потоку однажды
 * поставят веху «выставка 1 марта» — и он молча перестанет считаться потоком
 * (решение владельца 30.09).
 *
 * Включение потока ЗАОДНО СНИМАЕТ фиксацию базового плана — у потока нет
 * утверждённого плана, а зафиксированный базовый план превращает каждый перенос
 * срока в отклонение. Именно это и случилось с «Продажами мечты»: план
 * зафиксирован 14.04.2026, утверждающего нет — то есть никто не нажимал,
 * сработала автофиксация. Обратно фиксация не возвращается: снять — действие
 * владельца, вернуть — тоже (кнопка фиксации на месте).
 */

// У НИОКР, СТМ, КМ, CRM и протоколов свой жизненный цикл — там этот признак
// только путал бы.
const FORBIDDEN_TYPES = new Set(["npd", "crm", "crm_client", "stm", "protocol"]);

function isEligible(group: TaskGroup): boolean {
  const type = (group as { project_type?: string }).project_type;
  if (type && FORBIDDEN_TYPES.has(type)) return false;
  // У подпроекта режим наследуется от родителя: отдельный признак на ветке
  // означал бы, что часть проекта живёт по плану, а часть нет.
  if (group.parent_id) return false;
  return true;
}

export function WorkModeToggleInline({ group }: { group: TaskGroup }) {
  const qc = useQueryClient();
  const { data: groups = [] } = useTaskGroups();
  const live = (groups.find((g) => g.id === group.id) ?? group) as TaskGroup & {
    work_mode?: string | null;
    baseline_status?: string;
  };
  const isFlow = live.work_mode === "flow";

  const setMode = useMutation({
    mutationFn: async (flow: boolean) => {
      const mode = flow ? "flow" : "plan";
      const { error } = await supabase
        .from("task_groups")
        .update({ work_mode: mode } as never)
        .eq("id", group.id);
      if (error) throw error;

      let unlocked = false;
      if (flow && live.baseline_status === "locked") {
        const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", group.id);
        const ids = [group.id, ...(subs ?? []).map((s) => s.id)];
        const { error: bErr } = await supabase
          .from("task_groups")
          .update({ baseline_status: "planning", baseline_locked_at: null } as never)
          .in("id", ids);
        // Сбой снятия фиксации не должен откатывать сам признак: режим важнее,
        // а фиксацию можно снять отдельно.
        if (bErr) toast.warning("Режим сохранён, но фиксацию базового плана снять не удалось: " + bErr.message);
        else unlocked = true;
      }
      return { mode, unlocked };
    },
    onMutate: async (flow) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      qc.getQueriesData<TaskGroup[]>({ queryKey: ["task_groups"] }).forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<TaskGroup[]>(
          key,
          data.map((g) => (g.id === group.id ? ({ ...g, work_mode: flow ? "flow" : "plan" } as TaskGroup) : g)),
        );
      });
    },
    onSuccess: ({ mode, unlocked }) => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      if (mode === "flow") {
        toast.success(
          unlocked
            ? "Операционный поток. Фиксация базового плана снята — переносы сроков больше не считаются отклонением"
            : "Операционный поток: автофиксация базового плана к нему не применяется",
        );
      } else {
        toast.success("Проект с планом: вехи, связи и базовый план работают как обычно");
      }
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      toast.error(e.message ?? "Не удалось сохранить режим");
    },
  });

  if (!isEligible(group)) return null;

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="work-mode-toggle"
        checked={isFlow}
        onCheckedChange={(v) => setMode.mutate(v)}
        disabled={setMode.isPending}
      />
      <Label
        htmlFor="work-mode-toggle"
        className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer"
        title={
          "Операционный поток — поручения без плана: вехи и критический путь к нему не применяются, " +
          "базовый план не фиксируется автоматически, помощник разбирает его по висякам и людям. " +
          "Выключено — проект с планом."
        }
      >
        <GitBranch className="h-3 w-3" /> Поток
      </Label>
    </div>
  );
}

export default WorkModeToggleInline;
