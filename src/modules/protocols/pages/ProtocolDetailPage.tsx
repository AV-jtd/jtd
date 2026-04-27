import { useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, FileText, Sparkles, Send, Trash2, Loader2, Eye, AlertCircle } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { usePublishProtocol, useDiscardProtocolDraft } from "@/hooks/usePublishProtocol";
import { useAuth } from "@/hooks/useAuth";
import ProtocolTableView from "@/modules/protocols/components/ProtocolTableView";
import ProtocolHeader from "@/modules/protocols/components/ProtocolHeader";
import ProtocolInternalSection, { CrmReportPlaceholder } from "@/modules/protocols/components/ProtocolInternalSection";
import ProtocolPreviewDialog from "@/modules/protocols/components/ProtocolPreviewDialog";
import ProtocolSummary from "@/modules/protocols/components/ProtocolSummary";
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
  const { user } = useAuth();
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
  const templateKey: string | undefined = (protocol as any)?.protocol_meta?.template_system_key;
  const isCrossFunctional =
    templateKey === "cross_functional" ||
    (typeof (protocol as any)?.name === "string" &&
      (protocol as any).name.startsWith("Кросс-функциональный"));
  const isLiving = templateKey === "living";
  // Если пользователь не владелец, но числится в internal_attendees — показать чип
  const isOwner = !!(protocol && user && (protocol as any).user_id === user.id);
  const isInternalAttendee = useMemo(() => {
    const attendees: string[] = ((protocol as any)?.protocol_meta?.internal_attendees) ?? [];
    return !!user && Array.isArray(attendees) && attendees.includes(user.id);
  }, [protocol, user]);
  const showAttendeeChip = !isOwner && isInternalAttendee;
  const draftTaskCount = useMemo(
    () => tasks.filter((t) => t.group_id === id && (t as any).is_draft).length,
    [tasks, id],
  );

  // Soft discipline check for cross-functional drafts: warn (do not block) when
  // key facilitation fields are empty. This mirrors the agreed "Soft" enforcement.
  const softWarnings = useMemo<string[]>(() => {
    if (!protocol || !isDraft || !isCrossFunctional) return [];
    const w: string[] = [];
    const desc: string | null = (protocol as any).description;
    const meta: any = (protocol as any).protocol_meta || {};
    const internalAttendees: string[] = meta.internal_attendees || [];
    const taskAssignees = new Set(
      tasks
        .filter((t) => t.group_id === id && t.assigned_to)
        .map((t) => t.assigned_to as string),
    );
    if (!desc || !desc.trim()) w.push("укажите цель встречи в описании");
    if (internalAttendees.length === 0 && taskAssignees.size === 0) {
      w.push("добавьте внутренних участников");
    }
    return w;
  }, [protocol, isDraft, isCrossFunctional, tasks, id]);

  return (
    <ModuleLayout moduleContext="pmo">
      <div className="mx-auto max-w-7xl px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-8">
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
              isCrossFunctional={isCrossFunctional}
              internalAttendeeIds={Array.from(new Set(
                tasks
                  .filter((t) => t.group_id === id && t.assigned_to)
                  .map((t) => t.assigned_to as string)
              ))}
            />

            {isDraft && (
              <div className="mb-5 flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <p className="min-w-0 truncate text-sm">
                    <span className="font-semibold text-foreground">Черновик</span>
                    <span className="hidden text-muted-foreground sm:inline">
                      {" "}— {draftTaskCount}{" "}
                      {draftTaskCount === 1
                        ? "задача"
                        : draftTaskCount > 1 && draftTaskCount < 5
                        ? "задачи"
                        : "задач"}, исполнители не уведомлены
                    </span>
                    <span className="text-muted-foreground sm:hidden"> · {draftTaskCount}</span>
                  </p>
                  {showAttendeeChip && (
                    <span
                      className="hidden shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary md:inline-flex"
                      title="Вы — участник встречи. Можете править черновик до публикации."
                    >
                      Участник
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-destructive"
                        aria-label="Удалить черновик"
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
                    className="h-8 gap-1.5 px-2"
                    aria-label="Превью"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Превью</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => publishMut.mutate(protocol.id)}
                    disabled={publishMut.isPending || draftTaskCount === 0}
                    className="h-8 gap-1.5 bg-amber-500 px-2.5 text-white hover:bg-amber-600 sm:px-3"
                    aria-label="Опубликовать"
                  >
                    {publishMut.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden xs:inline sm:inline">Опубликовать</span>
                    <span className="xs:hidden sm:hidden">Публ.</span>
                  </Button>
                </div>
              </div>
            )}

            {softWarnings.length > 0 && (
              <div
                className="mb-5 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
                role="status"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 text-foreground/90">
                  <span className="font-medium">Чтобы встреча прошла продуктивно:</span>{" "}
                  <span className="text-muted-foreground">{softWarnings.join("; ")}.</span>
                </div>
              </div>
            )}

            <ProtocolSummary
              protocolId={protocol.id}
              protocolName={protocol.name}
              protocolMeta={(protocol as any).protocol_meta}
            />

            <ProtocolTableView protocolId={protocol.id} />

            {/* 🔴 Internal section (own team) + CRM report placeholder — hidden for cross-functional and living */}
            {!isCrossFunctional && !isLiving && (
              <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
                <ProtocolInternalSection protocolId={protocol.id} />
                <CrmReportPlaceholder />
              </div>
            )}
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
