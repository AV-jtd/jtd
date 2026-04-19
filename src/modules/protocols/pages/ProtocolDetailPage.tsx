import { useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, FileText, Sparkles, Send, Trash2, Loader2, Eye } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { usePublishProtocol, useDiscardProtocolDraft } from "@/hooks/usePublishProtocol";
import ProtocolTableView from "@/modules/protocols/components/ProtocolTableView";
import ProtocolHeader from "@/modules/protocols/components/ProtocolHeader";
import ProtocolInternalSection, { CrmReportPlaceholder } from "@/modules/protocols/components/ProtocolInternalSection";
import ProtocolPreviewDialog from "@/modules/protocols/components/ProtocolPreviewDialog";
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

export default function ProtocolDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: groups = [], isLoading } = useTaskGroups();
  // Pass protocol id so draft (is_draft) tasks are NOT filtered out — drafts must be visible inside the protocol page itself.
  const { data: tasks = [] } = useTasks(id);
  const publishMut = usePublishProtocol();
  const discardMut = useDiscardProtocolDraft();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
            <ProtocolHeader
              protocol={protocol as any}
              isDraft={isDraft}
              internalAttendeeIds={Array.from(new Set(
                tasks
                  .filter((t) => t.group_id === id && t.assigned_to)
                  .map((t) => t.assigned_to as string)
              ))}
            />

            {isDraft && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <p className="truncate text-sm">
                    <span className="font-semibold text-foreground">Черновик</span>
                    <span className="text-muted-foreground"> — {draftTaskCount}{" "}
                      {draftTaskCount === 1
                        ? "задача"
                        : draftTaskCount > 1 && draftTaskCount < 5
                        ? "задачи"
                        : "задач"}, исполнители не уведомлены
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Удалить</span>
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
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewOpen(true)}
                    className="h-8 gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Превью</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => publishMut.mutate(protocol.id)}
                    disabled={publishMut.isPending || draftTaskCount === 0}
                    className="h-8 gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
                  >
                    {publishMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Опубликовать
                  </Button>
                </div>
              </div>
            )}

            <ProtocolTableView protocolId={protocol.id} />

            {/* 🔴 Internal section (own team) + CRM report placeholder */}
            <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <ProtocolInternalSection protocolId={protocol.id} />
              <CrmReportPlaceholder />
            </div>
          </>
        )}
      </div>

      {protocol && (
        <ProtocolPreviewDialog
          protocolId={protocol.id}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </ModuleLayout>
  );
}
