import { useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, FileText, Sparkles, Send, Trash2, Loader2 } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { usePublishProtocol, useDiscardProtocolDraft } from "@/hooks/usePublishProtocol";
import ProtocolTableView from "@/modules/protocols/components/ProtocolTableView";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function ProtocolDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: groups = [], isLoading } = useTaskGroups();
  const { data: tasks = [] } = useTasks();
  const publishMut = usePublishProtocol();
  const discardMut = useDiscardProtocolDraft();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const protocol = useMemo(
    () => groups.find((g) => g.id === id && g.project_type === "protocol"),
    [groups, id],
  );

  const isDraft = (protocol as any)?.draft_status === "draft";
  const draftTaskCount = useMemo(
    () => tasks.filter((t) => t.group_id === id && (t as any).is_draft).length,
    [tasks, id],
  );

  return (
    <ModuleLayout moduleContext="pmo">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <button
          onClick={() => navigate("/protocols")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          К списку протоколов
        </button>

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
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold text-foreground">
                    {protocol.name}
                  </h1>
                  {isDraft && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Черновик
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Создан {format(parseISO(protocol.created_at), "d MMMM yyyy", { locale: ru })}
                  {protocol.closed_at && " · Архив"}
                </p>
              </div>
            </div>

            {isDraft && (
              <div className="mb-5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Режим черновика — {draftTaskCount}{" "}
                        {draftTaskCount === 1
                          ? "задача"
                          : draftTaskCount > 1 && draftTaskCount < 5
                          ? "задачи"
                          : "задач"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Отредактируйте задачи в таблице ниже. Исполнители ничего не видят и не получают уведомлений до публикации.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Удалить черновик
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить черновик протокола?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Будут удалены все {draftTaskCount} задач этого протокола. Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await discardMut.mutateAsync(protocol.id);
                              navigate("/protocols");
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      size="sm"
                      onClick={() => publishMut.mutate(protocol.id)}
                      disabled={publishMut.isPending || draftTaskCount === 0}
                      className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
                    >
                      {publishMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Опубликовать протокол
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <ProtocolTableView protocolId={protocol.id} />
          </>
        )}
      </div>
    </ModuleLayout>
  );
}
