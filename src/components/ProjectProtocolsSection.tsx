import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { FileText, ChevronDown, ChevronRight, ExternalLink, ListChecks } from "lucide-react";
import { useProjectProtocols } from "@/hooks/useProjectProtocols";
import { useTasks } from "@/hooks/useTasks";
import ProjectIcon from "@/components/ProjectIcon";
import TaskItem from "@/components/TaskItem";
import DecisionsSection from "@/components/decisions/DecisionsSection";
import { cn } from "@/lib/utils";

/**
 * Секция «Протоколы совещаний» в карточке проекта.
 * Находит протоколы, привязанные к проекту через context_project_id,
 * и под каждым показывает решения встречи + её задачи.
 * Протокол остаётся автономным объектом своего модуля.
 */
export default function ProjectProtocolsSection({ projectId }: { projectId: string }) {
  const { data: protocols = [], isLoading } = useProjectProtocols(projectId);

  if (isLoading || protocols.length === 0) return null;

  return (
    <div className="space-y-1.5 pt-2 border-t border-border/40">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3 w-3" /> Протоколы совещаний
        <span className="text-muted-foreground/60">· {protocols.length}</span>
      </p>
      <div className="space-y-1.5">
        {protocols.map((p) => (
          <ProtocolCard key={p.id} protocol={p} />
        ))}
      </div>
    </div>
  );
}

function ProtocolCard({ protocol }: { protocol: any }) {
  const [open, setOpen] = useState(false);
  const meta = protocol.protocol_meta || {};
  const meetingDate = meta.meeting_date as string | undefined;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <ProjectIcon group={protocol} size="sm" fallbackEmoji="📋" />
          <span className="text-xs font-medium truncate">{protocol.name}</span>
          {meetingDate && (
            <span className="text-[10px] text-muted-foreground/70 shrink-0">
              {format(parseISO(meetingDate), "d MMM yyyy", { locale: ru })}
            </span>
          )}
        </button>
        <Link
          to={`/protocols/${protocol.id}`}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="Открыть протокол"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {open && (
        <div className="px-2 pb-2 space-y-2 animate-fade-in">
          <DecisionsSection
            protocolId={protocol.id}
            title="Решения встречи"
            emptyHint="Решения по этой встрече ещё не зафиксированы."
            compact
          />
          <ProtocolTasks protocolId={protocol.id} />
        </div>
      )}
    </div>
  );
}

function ProtocolTasks({ protocolId }: { protocolId: string }) {
  const { data: tasks = [] } = useTasks(protocolId);
  const rows = tasks.filter((t: any) => t.task_type !== "protocol_review");

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <ListChecks className="h-3 w-3" /> Задачи встречи
        <span className="text-muted-foreground/60">· {rows.length}</span>
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic px-1">Нет задач</p>
      ) : (
        <div className={cn("space-y-0.5")}>
          {rows.map((task: any) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
