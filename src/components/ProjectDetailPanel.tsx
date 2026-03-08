import { useState, useMemo, useRef } from "react";
import { TaskGroup, useTaskMutations, useGroupMembers, useAvailableUsers, useTaskGroups, useTags, useGroupTags, useTasks, Profile, Task } from "@/hooks/useTasks";
import TaskItem from "@/components/TaskItem";
import { FileText, UserPlus, Users, Plus, X, FolderOpen, Download, Upload, Tag, Briefcase, ChevronDown, ChevronRight, ListChecks, CalendarIcon, User, AlertTriangle, ArrowRightLeft, CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import SmartExportDialog from "@/components/SmartExportDialog";
import SmartImportDialog from "@/components/SmartImportDialog";
import { toast } from "sonner";
import { format, differenceInDays, addDays, startOfDay } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ProjectDetailPanelProps {
  group: TaskGroup;
}

export default function ProjectDetailPanel({ group }: ProjectDetailPanelProps) {
  const { updateGroupDescription, addGroupMember, removeGroupMember, updateGroupParent, addGroupTag, removeGroupTag, updateGroupProjectType } = useTaskMutations();
  const { data: allGroups = [] } = useTaskGroups();
  const { data: members = [] } = useGroupMembers(group.id);
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: allTags = [] } = useTags();
  const { data: groupTags = [] } = useGroupTags(group.id);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState((group as any).description || "");
  const [userSearch, setUserSearch] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const handleSaveDescription = () => {
    const newDesc = descriptionDraft.trim() || null;
    if (newDesc !== ((group as any).description || null)) {
      updateGroupDescription.mutate({ id: group.id, description: newDesc });
    }
    setEditingDescription(false);
  };

  const filteredUsers = useMemo(() => {
    const memberIds = members.map(m => m.user_id);
    return availableUsers.filter(u => {
      if (memberIds.includes(u.id)) return false;
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return u.display_name?.toLowerCase().includes(q);
    });
  }, [availableUsers, members, userSearch]);

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || userId.slice(0, 8);
  };

  const assignee = members.find(m => m.role === "assignee");
  const participantMembers = members.filter(m => m.role === "participant");

  const groupTagIds = groupTags.map(gt => gt.tag_id);
  const linkedTagId = group.linked_tag_id;
  const assignedTags = allTags.filter(t => groupTagIds.includes(t.id));
  const availableTags = allTags.filter(t => !groupTagIds.includes(t.id) && t.id !== linkedTagId);
  const filteredAvailableTags = availableTags.filter(t => {
    if (!tagSearch.trim()) return true;
    return t.name.toLowerCase().includes(tagSearch.toLowerCase());
  });

  const UserPicker = ({ role, onClose }: { role: "assignee" | "participant"; onClose: () => void }) => (
    <>
      <Input
        autoFocus
        value={userSearch}
        onChange={(e) => setUserSearch(e.target.value)}
        placeholder="Поиск по имени..."
        className="h-7 text-xs mb-2"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filteredUsers.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
        )}
        {filteredUsers.map(u => (
          <button
            key={u.id}
            onClick={() => {
              addGroupMember.mutate({ group_id: group.id, user_id: u.id, role });
              onClose();
              setUserSearch("");
            }}
            className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
          >
            <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-4 animate-fade-in">
      {/* Description */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> Описание проекта
        </p>
        {editingDescription ? (
          <div className="space-y-1.5">
            <Textarea
              autoFocus
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              placeholder="Добавьте описание проекта..."
              className="text-sm min-h-[60px] resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleSaveDescription} className="text-xs text-primary hover:text-primary/80">Сохранить</button>
              <button onClick={() => { setEditingDescription(false); setDescriptionDraft((group as any).description || ""); }} className="text-xs text-muted-foreground hover:text-foreground">Отмена</button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => { setEditingDescription(true); setDescriptionDraft((group as any).description || ""); }}
            className="text-sm text-foreground/80 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 min-h-[32px] transition-colors"
          >
            {(group as any).description || <span className="text-muted-foreground italic">Нажмите чтобы добавить описание...</span>}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Тэги
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {assignedTags.map(tag => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: (tag.color || '#6366f1') + '22', color: tag.color || '#6366f1' }}
            >
              {tag.name}
              <button
                onClick={() => removeGroupTag.mutate({ group_id: group.id, tag_id: tag.id })}
                className="hover:opacity-70 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <Popover open={tagPickerOpen} onOpenChange={(open) => { setTagPickerOpen(open); setTagSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Plus className="h-2.5 w-2.5" /> Тэг
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="bottom">
              <Input
                autoFocus
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Поиск тэга..."
                className="h-7 text-xs mb-2"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {filteredAvailableTags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Нет доступных тэгов</p>
                )}
                {filteredAvailableTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => {
                      addGroupTag.mutate({ group_id: group.id, tag_id: tag.id });
                      setTagPickerOpen(false);
                      setTagSearch("");
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color || '#6366f1' }}
                    />
                    {tag.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Parent Project */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FolderOpen className="h-3 w-3" /> Родительский проект
        </p>
        <div className="flex items-center gap-2">
          {group.parent_id ? (
            <>
              <span className="text-sm text-foreground">
                {allGroups.find(g => g.id === group.parent_id)?.name || "Неизвестный проект"}
              </span>
              <button
                onClick={() => updateGroupParent.mutate({ id: group.id, parent_id: null })}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Plus className="h-2.5 w-2.5" /> {group.parent_id ? "Изменить" : "Назначить"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="bottom">
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Выберите проект</p>
                {allGroups.filter(g => g.id !== group.id && !g.parent_id).map(g => (
                  <button
                    key={g.id}
                    onClick={() => updateGroupParent.mutate({ id: group.id, parent_id: g.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <FolderOpen className="h-3 w-3 text-muted-foreground" />
                    {g.name}
                  </button>
                ))}
                {allGroups.filter(g => g.id !== group.id && !g.parent_id).length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Нет проектов</p>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* CRM toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="crm-toggle" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <Briefcase className="h-3 w-3" /> Показывать в CRM
          </Label>
          <Switch
            id="crm-toggle"
            checked={(group as any).project_type === "crm"}
            onCheckedChange={(checked) => {
              updateGroupProjectType.mutate({ id: group.id, project_type: checked ? "crm" : "standard" });
            }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground/70">Задачи проекта будут отображаться на CRM-доске</p>
      </div>

      {/* Assignee */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <UserPlus className="h-3 w-3" /> Ответственный
        </p>
        {assignee ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">{getProfileName(assignee.user_id)}</span>
            <button
              onClick={() => removeGroupMember.mutate({ group_id: group.id, member_user_id: assignee.user_id })}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Popover open={userPickerOpen === "assignee"} onOpenChange={(open) => { setUserPickerOpen(open ? "assignee" : null); setUserSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Plus className="h-2.5 w-2.5" /> Назначить
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" side="bottom">
              <UserPicker role="assignee" onClose={() => setUserPickerOpen(null)} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Participants */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Users className="h-3 w-3" /> Участники
          <span className="text-muted-foreground/60">· видят задачи проекта</span>
        </p>
        <div className="space-y-1">
          {participantMembers.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-sm text-foreground">{getProfileName(m.user_id)}</span>
              <button
                onClick={() => removeGroupMember.mutate({ group_id: group.id, member_user_id: m.user_id })}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Popover open={userPickerOpen === "participant"} onOpenChange={(open) => { setUserPickerOpen(open ? "participant" : null); setUserSearch(""); }}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Plus className="h-2.5 w-2.5" /> Участник
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" side="bottom">
              <UserPicker role="participant" onClose={() => setUserPickerOpen(null)} />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {/* Import / Export */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Download className="h-3 w-3" /> Импорт / Экспорт
        </p>
        <div className="flex items-center gap-2">
          <SmartExportDialog groupId={group.id} groupName={group.name} />
          <SmartImportDialog
            targetGroupId={group.id}
            trigger={
              <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Download className="h-3 w-3" /> Импорт Excel
              </button>
            }
          />
        </div>
      </div>

      {/* Subprojects */}
      <SubprojectsList parentId={group.id} />

      {/* Tasks */}
      <TasksSection groupId={group.id} />
    </div>
  );
}

// ── Subprojects list ──
function SubprojectsList({ parentId }: { parentId: string }) {
  const { data: allGroups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: availableUsers = [] } = useAvailableUsers();
  const subprojects = allGroups.filter(g => g.parent_id === parentId);

  if (subprojects.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <FolderOpen className="h-3 w-3" /> Подпроекты
        <span className="text-muted-foreground/60">· {subprojects.length}</span>
      </p>
      <div className="space-y-2 animate-fade-in">
        {subprojects.map(sub => (
          <SubprojectDashboardCard
            key={sub.id}
            group={sub}
            allTasks={allTasks}
            allGroups={allGroups}
            users={availableUsers}
          />
        ))}
      </div>
    </div>
  );
}

type SubprojectStats = {
  total: number;
  completed: number;
  overdue: number;
  driftCount: number;
  upcomingTasks: Task[];
  overdueTasks: Task[];
  driftTasks: { task: Task; driftDays: number }[];
  timingStatus: "on-track" | "at-risk" | "overdue" | "completed";
};

function computeSubprojectStats(groupId: string, allTasks: Task[], allGroups: TaskGroup[]): SubprojectStats {
  const directTasks = allTasks.filter(t => t.group_id === groupId);
  const childGroups = allGroups.filter(g => g.parent_id === groupId);
  const childTasks = childGroups.flatMap(cg => allTasks.filter(t => t.group_id === cg.id));
  const tasks = [...directTasks, ...childTasks];

  const now = new Date();
  const total = tasks.length;
  const completed = tasks.filter(t => t.is_completed).length;
  const activeTasks = tasks.filter(t => !t.is_completed);

  const overdueTasks = activeTasks
    .filter(t => t.deadline && new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const weekFromNow = addDays(startOfDay(now), 7);
  const upcomingTasks = activeTasks
    .filter(t => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const driftTasks = tasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => ({ task: t, driftDays: differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!)) }))
    .sort((a, b) => Math.abs(b.driftDays) - Math.abs(a.driftDays));

  let timingStatus: SubprojectStats["timingStatus"] = "on-track";
  if (activeTasks.length === 0 && tasks.length > 0) timingStatus = "completed";
  else if (overdueTasks.length > 0) timingStatus = "overdue";
  else if (driftTasks.length > 0) timingStatus = "at-risk";

  return { total, completed, overdue: overdueTasks.length, driftCount: driftTasks.length, upcomingTasks, overdueTasks, driftTasks, timingStatus };
}

function getTimingLabel(s: SubprojectStats["timingStatus"]) {
  switch (s) {
    case "on-track": return "В графике";
    case "at-risk": return "Drift";
    case "overdue": return "Просрочено";
    case "completed": return "Завершён";
  }
}

function getTimingBadgeClass(s: SubprojectStats["timingStatus"]) {
  switch (s) {
    case "on-track": return "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400";
    case "at-risk": return "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400";
    case "overdue": return "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400";
    case "completed": return "text-muted-foreground bg-muted border-border";
  }
}

function SubprojectDashboardCard({ group, allTasks, allGroups, users }: {
  group: TaskGroup;
  allTasks: Task[];
  allGroups: TaskGroup[];
  users: Profile[];
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => computeSubprojectStats(group.id, allTasks, allGroups), [group.id, allTasks, allGroups]);
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
  const displayName = group.name.includes("/") ? group.name.split("/").pop()!.trim() : group.name;
  const childSubs = allGroups.filter(g => g.parent_id === group.id);

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden transition-shadow", expanded && "shadow-md")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
          style={{ backgroundColor: group.color || "hsl(var(--primary))" }}
        >
          {group.icon && group.icon !== "list" ? group.icon : displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs truncate">{displayName}</span>
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-medium", getTimingBadgeClass(stats.timingStatus))}>
              {getTimingLabel(stats.timingStatus)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 max-w-[100px]">
              <Progress value={pct} className="h-1" />
            </div>
            <span className="text-[10px] text-muted-foreground">{pct}% · {stats.completed}/{stats.total}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground">
          {stats.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />{stats.overdue}
            </span>
          )}
          {stats.driftCount > 0 && (
            <span className="flex items-center gap-0.5 text-amber-500 font-medium">
              <ArrowRightLeft className="h-3 w-3" />{stats.driftCount}
            </span>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3 animate-fade-in">
          {/* Nested subprojects */}
          {childSubs.length > 0 && (
            <DashboardSection title="Подпроекты" count={childSubs.length}>
              <div className="space-y-1.5">
                {childSubs.map(cs => (
                  <SubprojectDashboardCard key={cs.id} group={cs} allTasks={allTasks} allGroups={allGroups} users={users} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.overdueTasks.length > 0 && (
            <DashboardSection title="Просроченные" count={stats.overdueTasks.length} variant="destructive">
              <div className="space-y-0.5">
                {stats.overdueTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} variant="overdue" />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.upcomingTasks.length > 0 && (
            <DashboardSection title="Ближайшие дедлайны" count={stats.upcomingTasks.length}>
              <div className="space-y-0.5">
                {stats.upcomingTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.driftTasks.length > 0 && (
            <DashboardSection title="Deadline Drift" count={stats.driftTasks.length} variant="warning">
              <div className="space-y-0.5">
                {stats.driftTasks.map(({ task: t, driftDays }) => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} drift={driftDays} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.total === 0 && childSubs.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-1">Нет задач</p>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardSection({ title, count, children, variant }: {
  title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning";
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          "text-[11px] font-semibold",
          variant === "destructive" ? "text-destructive" : variant === "warning" ? "text-amber-500" : "text-foreground"
        )}>{title}</span>
        <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function DashboardTaskRow({ task, userName, variant, drift }: {
  task: Task; userName: string; variant?: "overdue"; drift?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-left">
      <span className={cn(
        "text-[11px] truncate flex-1",
        variant === "overdue" ? "text-destructive" : "text-foreground",
        task.is_completed && "line-through text-muted-foreground"
      )}>
        {task.title}
      </span>
      {drift !== undefined && (
        <span className={cn(
          "text-[9px] font-mono font-semibold shrink-0",
          drift > 0 ? "text-destructive" : "text-emerald-500"
        )}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}
      {task.deadline && (
        <span className="text-[9px] text-muted-foreground shrink-0">
          {format(new Date(task.deadline), "d MMM", { locale: ru })}
        </span>
      )}
      {userName && userName !== "—" && (
        <span className="text-[9px] text-muted-foreground shrink-0 max-w-[70px] truncate">
          {userName}
        </span>
      )}
    </div>
  );
}

// ── Tasks section ──
function TasksSection({ groupId }: { groupId: string }) {
  const { data: tasks = [] } = useTasks(groupId);
  const { addTask } = useTaskMutations();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: members = [] } = useGroupMembers(groupId);
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);
  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState<Date | undefined>(undefined);
  const [newAssignee, setNewAssignee] = useState<string | null>(null);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // All users who can be assigned: group members + available users
  const assignableUsers = useMemo(() => {
    const memberIds = members.map(m => m.user_id);
    const allIds = new Set([...memberIds]);
    return availableUsers.filter(u => allIds.has(u.id));
  }, [members, availableUsers]);

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask.mutate({
      title: newTitle.trim(),
      group_id: groupId,
      deadline: newDeadline ? newDeadline.toISOString() : null,
      assigned_to: newAssignee,
    });
    setNewTitle("");
    setNewDeadline(undefined);
    setNewAssignee(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const resetAdding = () => {
    setAdding(false);
    setNewTitle("");
    setNewDeadline(undefined);
    setNewAssignee(null);
  };

  const getAssigneeName = (id: string) => availableUsers.find(u => u.id === id)?.display_name || id.slice(0, 8);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ListChecks className="h-3 w-3" /> Задачи
          <span className="text-muted-foreground/60">· {activeTasks.length}{completedTasks.length > 0 ? ` (+${completedTasks.length} ✓)` : ""}</span>
        </p>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" /> Задача
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-1.5 animate-fade-in rounded-lg border border-primary/20 bg-muted/30 p-2">
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Название задачи..."
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") resetAdding();
            }}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Deadline picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                  newDeadline
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  <CalendarIcon className="h-2.5 w-2.5" />
                  {newDeadline ? format(newDeadline, "d MMM", { locale: ru }) : "Срок"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" side="bottom" align="start">
                <Calendar
                  mode="single"
                  selected={newDeadline}
                  onSelect={(d) => setNewDeadline(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {newDeadline && (
              <button onClick={() => setNewDeadline(undefined)} className="text-muted-foreground hover:text-foreground">
                <X className="h-2.5 w-2.5" />
              </button>
            )}

            {/* Assignee picker */}
            <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
              <PopoverTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                  newAssignee
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  <User className="h-2.5 w-2.5" />
                  {newAssignee ? getAssigneeName(newAssignee) : "Ответственный"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" side="bottom" align="start">
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {assignableUsers.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">Нет участников</p>
                  )}
                  {assignableUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setNewAssignee(u.id); setAssigneePickerOpen(false); }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left"
                    >
                      {u.display_name || "Без имени"}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {newAssignee && (
              <button onClick={() => setNewAssignee(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-2.5 w-2.5" />
              </button>
            )}

            <div className="flex-1" />
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              OK
            </button>
            <button onClick={resetAdding} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      {activeTasks.length === 0 && completedTasks.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground/60 italic px-1">Нет задач</p>
      )}
      <div className="space-y-0.5">
        {activeTasks.map(task => (
          <TaskItem key={task.id} task={task} />
        ))}
      </div>
      {completedTasks.length > 0 && (
        <>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showCompleted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Завершённые ({completedTasks.length})
          </button>
          {showCompleted && (
            <div className="space-y-0.5 animate-fade-in">
              {completedTasks.map(task => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
