import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Lightbulb, Plus, Lock, FileText, FolderOpen, Tag as TagIcon, Briefcase, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useVisibleTags } from "@/hooks/useTasks";
import { useDecisions, useDeleteDecision, type Decision } from "@/hooks/useDecisions";
import DecisionDialog from "./DecisionDialog";
import { cn } from "@/lib/utils";

interface Props {
  /** Filter scope. At least one is recommended; if none — caller is responsible (e.g. CRM all-decisions sheet). */
  protocolId?: string | null;
  groupId?: string | null;
  clientId?: string | null;
  /** When true, shows the "+ Решение" button (only meaningful when protocolId is set). */
  allowCreate?: boolean;
  /** Force-create dialog always uses this protocol (required when allowCreate). */
  defaultProtocolId?: string | null;
  defaultProjectId?: string | null;
  defaultClientId?: string | null;
  title?: string;
  emptyHint?: string;
  compact?: boolean;
}

export default function DecisionsSection({
  protocolId,
  groupId,
  clientId,
  allowCreate = false,
  defaultProtocolId,
  defaultProjectId,
  defaultClientId,
  title = "Решения",
  emptyHint = "Пока нет принятых решений",
  compact = false,
}: Props) {
  const { user } = useAuth();
  const { data: decisions = [], isLoading } = useDecisions({ protocolId, groupId, clientId });
  const [editing, setEditing] = useState<Decision | null>(null);
  const [creating, setCreating] = useState(false);
  const deleteMut = useDeleteDecision();

  const createProtocolId = defaultProtocolId ?? protocolId ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <span>{title}</span>
          {decisions.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{decisions.length}</span>
          )}
        </div>
        {allowCreate && createProtocolId && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Решение
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="py-2 text-center text-xs text-muted-foreground">Загрузка…</p>
      ) : decisions.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground/70">{emptyHint}</p>
      ) : (
        <ul className="space-y-1.5">
          {decisions.map((d) => (
            <DecisionCard
              key={d.id}
              decision={d}
              compact={compact}
              onEdit={() => setEditing(d)}
              onDelete={() => deleteMut.mutate(d.id)}
              canManage={user?.id === d.user_id}
            />
          ))}
        </ul>
      )}

      {createProtocolId && (
        <DecisionDialog
          open={creating}
          onOpenChange={setCreating}
          protocolId={createProtocolId}
          defaultProjectId={defaultProjectId ?? undefined}
          defaultClientId={defaultClientId ?? undefined}
        />
      )}
      {editing && (
        <DecisionDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          protocolId={editing.protocol_id}
          decision={editing}
        />
      )}
    </div>
  );
}

function DecisionCard({
  decision,
  compact,
  onEdit,
  onDelete,
  canManage,
}: {
  decision: Decision;
  compact: boolean;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const { data: groups = [] } = useTaskGroups();
  const { data: tags = [] } = useVisibleTags();
  const projectMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const isRestricted = decision.visibility === "restricted";

  return (
    <li
      className={cn(
        "rounded-lg border p-2.5 text-sm",
        isRestricted
          ? "border-amber-500/30 bg-amber-500/[0.04]"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start gap-1.5">
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
              {decision.title}
            </p>
            {isRestricted && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400"
                title="Видно только указанному кругу лиц"
              >
                <Lock className="h-2.5 w-2.5" />
                Огранич.
              </span>
            )}
          </div>
          {decision.body && !compact && (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{decision.body}</p>
          )}
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span>{format(parseISO(decision.decided_at), "d MMM yyyy", { locale: ru })}</span>
            <span className="text-muted-foreground/40">·</span>
            <Link
              to={`/protocols/${decision.protocol_id}`}
              className="inline-flex items-center gap-0.5 hover:text-foreground"
            >
              <FileText className="h-2.5 w-2.5" /> Протокол
            </Link>
            {decision.project_ids.map((pid) => {
              const g = projectMap.get(pid);
              if (!g) return null;
              return (
                <Link
                  key={pid}
                  to={`/project/${pid}`}
                  className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5 hover:bg-muted"
                >
                  <FolderOpen className="h-2.5 w-2.5" /> {g.name}
                </Link>
              );
            })}
            {decision.tag_ids.map((tid) => {
              const t = tagMap.get(tid);
              if (!t) return null;
              return (
                <span
                  key={tid}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                  style={{
                    backgroundColor: (t.color || "#6366f1") + "22",
                    color: t.color || "inherit",
                  }}
                >
                  <TagIcon className="h-2.5 w-2.5" /> {t.name}
                </span>
              );
            })}
            {decision.client_ids.length > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1.5 py-0.5">
                <Briefcase className="h-2.5 w-2.5" /> {decision.client_ids.length}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={onEdit}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Редактировать"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Удалить"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить решение?</AlertDialogTitle>
                  <AlertDialogDescription>
                    «{decision.title}» — это действие нельзя отменить.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </li>
  );
}