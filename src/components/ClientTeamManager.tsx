import { useState, useMemo } from "react";
import { Users, UserPlus, X, Loader2 } from "lucide-react";
import MultiAssigneePicker from "@/components/MultiAssigneePicker";
import { useAvailableUsers } from "@/hooks/useTasks";
import { useClientTeam, useManageClientTeam } from "@/hooks/useClientTeam";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/**
 * Управление командой по клиенту: добавление/удаление участников.
 * Добавление человека = и запись в команде клиента, и доступ к чат-комнате клиента
 * (синхронизация через RPC manage_client_team).
 *
 * managerId — текущий ответственный (clients.manager_id), показывается отдельной строкой.
 */
export default function ClientTeamManager({
  clientId,
  managerName,
  className,
}: {
  clientId: string;
  managerName?: string | null;
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: users = [] } = useAvailableUsers();
  const { data: team = [], isLoading } = useClientTeam(clientId);
  const { addMember, removeMember } = useManageClientTeam(clientId);

  const excludeIds = useMemo(() => team.map((m) => m.userId), [team]);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> Команда по клиенту
        </div>
        <MultiAssigneePicker
          users={users}
          excludeIds={excludeIds}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          showExpansionToast
          onSelectUsers={async (ids) => {
            for (const id of ids) {
              await addMember.mutateAsync({ memberId: id });
            }
            setPickerOpen(false);
          }}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
              title="Добавить участника"
            >
              {addMember.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              Добавить
            </button>
          }
        />
      </div>

      <div className="space-y-1">
        {managerName && (
          <div className="flex items-center gap-2 text-xs">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
              {getInitials(managerName)}
            </span>
            <span className="truncate">{managerName}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">ответственный</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
          </div>
        ) : team.length === 0 && !managerName ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">
            Команда пуста. Добавьте участников — они получат доступ к чату клиента.
          </p>
        ) : (
          team.map((m) => (
            <div key={m.userId} className="group flex items-center gap-2 text-xs">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                {getInitials(m.name)}
              </span>
              <span className="truncate">{m.name}</span>
              {m.role && <span className="ml-auto truncate text-[10px] text-muted-foreground">{m.role}</span>}
              <button
                type="button"
                onClick={() => removeMember.mutate(m.userId)}
                disabled={removeMember.isPending}
                className={cn(
                  "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100",
                  m.role ? "ml-1" : "ml-auto",
                )}
                title="Убрать из команды"
                aria-label="Убрать из команды"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}