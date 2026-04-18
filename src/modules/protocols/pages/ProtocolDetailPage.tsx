import { useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { useTaskGroups } from "@/hooks/useTasks";
import ProtocolTableView from "@/modules/protocols/components/ProtocolTableView";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function ProtocolDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: groups = [], isLoading } = useTaskGroups();

  const protocol = useMemo(
    () => groups.find((g) => g.id === id && g.project_type === "protocol"),
    [groups, id],
  );

  return (
    <ModuleLayout moduleContext="pmo">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        {/* Breadcrumb / back */}
        <button
          onClick={() => navigate("/protocols")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          К списку протоколов
        </button>

        {/* Header */}
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : !protocol ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">Протокол не найден.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-start gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl"
                style={{
                  backgroundColor: `${protocol.color ?? "#6366f1"}20`,
                  color: protocol.color ?? "#6366f1",
                }}
              >
                {protocol.icon ?? "📋"}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-semibold text-foreground">
                  {protocol.name}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Создан {format(parseISO(protocol.created_at), "d MMMM yyyy", { locale: ru })}
                  {protocol.closed_at && " · Архив"}
                </p>
              </div>
            </div>

            <ProtocolTableView protocolId={protocol.id} />
          </>
        )}
      </div>
    </ModuleLayout>
  );
}
