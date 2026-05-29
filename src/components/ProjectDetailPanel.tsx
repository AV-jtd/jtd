import { useState, useMemo, useRef, useEffect, Suspense } from "react";
import { TaskGroup, useTaskMutations, useGroupMembers, useAvailableUsers, useTaskGroups, useVisibleTags, useGroupTags, useTasks, Profile, Task } from "@/hooks/useTasks";
import { startMeasure } from "@/lib/perf/perfMetrics";
import { Slider } from "@/components/ui/slider";
import TaskItem from "@/components/TaskItem";
import { FileText, UserPlus, Users, Plus, X, FolderOpen, Download, Upload, Tag, Briefcase, ChevronDown, ChevronRight, ListChecks, CalendarIcon, User, AlertTriangle, ArrowRightLeft, CalendarClock, Layers, BookOpen, Archive, RotateCcw, Lock, Clock } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
const ProjectWikiTab = lazyWithRetry(() => import("@/components/wiki/ProjectWikiTab"));
import SubprojectCards from "@/components/SubprojectCards";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Input } from "@/components/ui/input";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import AssigneeBadge from "@/components/AssigneeBadge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
const SmartExportDialog = lazyWithRetry(() => import("@/components/SmartExportDialog"));
const SmartImportDialog = lazyWithRetry(() => import("@/components/SmartImportDialog"));
const MigrateToNpdDialog = lazyWithRetry(() => import("@/components/MigrateToNpdDialog"));
import LensSettingsSection, { LensToggleInline } from "@/components/LensSettingsSection";
import DecisionsSection from "@/components/decisions/DecisionsSection";
import ProjectProtocolsSection from "@/components/ProjectProtocolsSection";
import { toast } from "sonner";
import { format, differenceInDays, addDays, startOfDay } from "date-fns";
import { parseISO } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { filterRealProjects } from "@/lib/projectFilters";

interface ProjectDetailPanelProps {
  group: TaskGroup;
}

export default function ProjectDetailPanel({ group }: ProjectDetailPanelProps) {
  const { updateGroupDescription, addGroupMember, removeGroupMember, updateGroupMemberRole, updateGroupParent, addGroupTag, removeGroupTag, updateGroupProjectType, closeProject, updateBaselineSettings } = useTaskMutations();
  // Measure mount → first paint of the project detail panel.
  // Each instance gets one sample; further re-renders are not counted.
  useEffect(() => {
    const end = startMeasure("panel-open", "ProjectDetailPanel.mount");
    end();
  }, []);
  const { data: allGroups = [] } = useTaskGroups();
  const { data: members = [] } = useGroupMembers(group.id);
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: allTags = [] } = useVisibleTags();
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
  const viewerMembers = members.filter(m => m.role === "viewer");

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
          {group.parent_id && allGroups.find(g => g.id === group.parent_id) ? (
            <>
              <span className="text-sm text-foreground">
                {allGroups.find(g => g.id === group.parent_id)!.name}
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
              <PopoverSearchList
                items={filterRealProjects(allGroups as any[]).filter(g => g.id !== group.id && !g.parent_id)}
                searchKey={(g) => g.name}
                header={<p className="text-xs font-medium text-muted-foreground px-2 py-1">Выберите проект</p>}
                placeholder="Найти проект..."
                emptyText="Нет проектов"
                renderItem={(g) => (
                  <button
                    key={g.id}
                    onClick={() => updateGroupParent.mutate({ id: group.id, parent_id: g.id })}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <FolderOpen className="h-3 w-3 text-muted-foreground" />
                    {g.name}
                  </button>
                )}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Module toggles — CRM & NPD in one row */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <ArrowRightLeft className="h-3 w-3" /> Модули
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="crm-toggle"
              checked={(group as any).project_type === "crm"}
              onCheckedChange={(checked) => {
                updateGroupProjectType.mutate({ id: group.id, project_type: checked ? "crm" : ((group as any).project_type === "crm" ? "standard" : (group as any).project_type) });
              }}
              disabled={(group as any).project_type === "npd"}
            />
            <Label htmlFor="crm-toggle" className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer">
              <Briefcase className="h-3 w-3" /> CRM
            </Label>
          </div>

          {!group.parent_id && (
            <div className="flex items-center gap-2">
              {(group as any).project_type === "npd" ? (
                <>
                  <Switch
                    id="npd-toggle"
                    checked={true}
                    onCheckedChange={() => {
                      updateGroupProjectType.mutate({ id: group.id, project_type: "standard" });
                    }}
                  />
                  <Label htmlFor="npd-toggle" className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer">
                    <Layers className="h-3 w-3" /> NPD
                  </Label>
                </>
              ) : (
                <Suspense fallback={
                  <div className="flex items-center gap-2 opacity-60">
                    <Switch id="npd-toggle" checked={false} className="pointer-events-none" />
                    <Label htmlFor="npd-toggle" className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Layers className="h-3 w-3" /> NPD
                    </Label>
                  </div>
                }>
                  <MigrateToNpdDialog
                    groupId={group.id}
                    trigger={
                      <div className="flex items-center gap-2 cursor-pointer">
                        <Switch
                          id="npd-toggle"
                          checked={false}
                          className="pointer-events-none"
                        />
                        <Label htmlFor="npd-toggle" className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer">
                          <Layers className="h-3 w-3" /> NPD
                        </Label>
                      </div>
                    }
                  />
                </Suspense>
              )}
            </div>
          )}

          <LensToggleInline group={group} />
        </div>
      </div>

      {/* Линза */}
      <LensSettingsSection group={group} />

      {/* Archive / Close Project */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Archive className="h-3 w-3" /> Архивация
        </p>
        {(group as any).closed_at ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Закрыт {format(new Date((group as any).closed_at), "d MMM yyyy", { locale: ru })}
            </span>
            <button
              onClick={() => {
                closeProject.mutate({ id: group.id, closed_at: null });
                toast.success("Проект переоткрыт");
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <RotateCcw className="h-3 w-3" /> Переоткрыть
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              closeProject.mutate({ id: group.id, closed_at: new Date().toISOString() });
              toast.success("Проект архивирован");
            }}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <Archive className="h-3 w-3" /> Закрыть проект
          </button>
        )}
      </div>


      {/* Baseline Lock Settings */}
      {!group.parent_id && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Фиксация сроков
          </p>
          {/* Approver picker */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 shrink-0">Утверждающий:</span>
              {(group as any).baseline_approver_id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-foreground">{getProfileName((group as any).baseline_approver_id)}</span>
                  <button
                    onClick={() => updateBaselineSettings.mutate({ id: group.id, baseline_approver_id: null })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                      <Plus className="h-2.5 w-2.5" /> Выбрать
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2" side="bottom">
                    <PopoverSearchList
                      items={availableUsers.filter(u => u.id !== group.user_id)}
                      searchKey={(u) => u.display_name || u.email || ""}
                      placeholder="Найти..."
                      emptyText="Нет пользователей"
                      renderItem={(u) => (
                        <button
                          key={u.id}
                          onClick={() => updateBaselineSettings.mutate({ id: group.id, baseline_approver_id: u.id })}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left"
                        >
                          {u.display_name || "Без имени"}
                        </button>
                      )}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {/* Auto-lock hours slider */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 shrink-0 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Автолок:
              </span>
              <Slider
                value={[(group as any).baseline_auto_lock_hours || 48]}
                onValueChange={([v]) => updateBaselineSettings.mutate({ id: group.id, baseline_auto_lock_hours: v })}
                min={24}
                max={120}
                step={24}
                className="flex-1"
              />
              <span className="text-xs font-mono text-muted-foreground w-10 text-right tabular-nums">
                {((group as any).baseline_auto_lock_hours || 48)}ч
              </span>
            </div>
          </div>
        </div>
      )}


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
          <span className="text-muted-foreground/60">· видят все задачи проекта и подпроектов</span>
        </p>
        <div className="space-y-1">
          {participantMembers.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="text-sm text-foreground flex-1">{getProfileName(m.user_id)}</span>
              <button
                onClick={() => updateGroupMemberRole.mutate({ group_id: group.id, member_user_id: m.user_id, role: "viewer" })}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
                title="Понизить до viewer (только навигация)"
              >
                → viewer
              </button>
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

      {/* Viewers */}
      {viewerMembers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <User className="h-3 w-3" /> Наблюдатели
            <span className="text-muted-foreground/60">· видят проект в навигации, но не задачи</span>
          </p>
          <div className="space-y-1">
            {viewerMembers.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <span className="text-sm text-foreground/70 flex-1">{getProfileName(m.user_id)}</span>
                <button
                  onClick={() => updateGroupMemberRole.mutate({ group_id: group.id, member_user_id: m.user_id, role: "participant" })}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="Повысить до participant (полный доступ)"
                >
                  → участник
                </button>
                <button
                  onClick={() => removeGroupMember.mutate({ group_id: group.id, member_user_id: m.user_id })}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Import / Export */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Download className="h-3 w-3" /> Импорт / Экспорт
        </p>
        <div className="flex items-center gap-2">
          <Suspense fallback={
            <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground/50">
              <Upload className="h-3 w-3" /> Экспорт
            </button>
          }>
            <SmartExportDialog groupId={group.id} groupName={group.name} />
          </Suspense>
          <Suspense fallback={
            <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground/50">
              <Download className="h-3 w-3" /> Импорт Excel
            </button>
          }>
            <SmartImportDialog
              targetGroupId={group.id}
              trigger={
                <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                  <Download className="h-3 w-3" /> Импорт Excel
                </button>
              }
            />
          </Suspense>
      </div>

      {/* Wiki / Knowledge Base */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <BookOpen className="h-3 w-3" /> База знаний
        </p>
        <Suspense fallback={
          <div className="text-xs text-muted-foreground/50 px-2 py-1.5">База знаний загружается...</div>
        }>
          <ProjectWikiTab groupId={group.id} groupName={group.name} groupDescription={group.description || undefined} compact />
        </Suspense>
      </div>
      </div>

      {/* Subprojects */}
      <SubprojectCards parentId={group.id} />

      {/* Tasks */}
      <TasksSection groupId={group.id} />

      {/* Протоколы совещаний, привязанные к проекту (решения + задачи встреч) */}
      <ProjectProtocolsSection projectId={group.id} />

      {/* Решения, привязанные напрямую к проекту */}
      <div className="pt-2 border-t border-border/40">
        <DecisionsSection
          groupId={group.id}
          title="Решения по проекту"
          emptyHint="Решения встреч, привязанные к этому проекту, появятся здесь."
          compact
        />
      </div>

      {/* Created at + creator (как в карточке задачи) */}
      {group.created_at && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60 pt-1">
          <Clock className="h-3 w-3" />
          Создан {format(parseISO(group.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
          {group.user_id && <span>· создал: {getProfileName(group.user_id)}</span>}
        </div>
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
  const [newDepartmentId, setNewDepartmentId] = useState<string | null>(null);
  const [newContractorId, setNewContractorId] = useState<string | null>(null);
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
      department_id: newDepartmentId,
      contractor_id: newContractorId,
    });
    setNewTitle("");
    setNewDeadline(undefined);
    setNewAssignee(null);
    setNewDepartmentId(null);
    setNewContractorId(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const resetAdding = () => {
    setAdding(false);
    setNewTitle("");
    setNewDeadline(undefined);
    setNewAssignee(null);
    setNewDepartmentId(null);
    setNewContractorId(null);
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
            <AssigneePicker
              users={assignableUsers}
              current={
                newAssignee
                  ? { kind: "user", id: newAssignee }
                  : newDepartmentId
                    ? { kind: "department", id: newDepartmentId }
                    : newContractorId
                      ? { kind: "contractor", id: newContractorId }
                      : undefined
              }
              onSelect={(sel: AssigneeSelection) => {
                if (sel.kind === "user") {
                  setNewAssignee(sel.id);
                  setNewDepartmentId(null);
                  setNewContractorId(null);
                } else if (sel.kind === "department") {
                  setNewDepartmentId(sel.id);
                  setNewAssignee(null);
                  setNewContractorId(null);
                } else if (sel.kind === "contractor") {
                  setNewContractorId(sel.id);
                  setNewAssignee(null);
                  setNewDepartmentId(null);
                } else {
                  setNewAssignee(null);
                  setNewDepartmentId(null);
                  setNewContractorId(null);
                }
              }}
              open={assigneePickerOpen}
              onOpenChange={setAssigneePickerOpen}
              side="bottom"
              trigger={
                <button className={cn(
                  "inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors",
                  (newAssignee || newDepartmentId || newContractorId)
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  {newAssignee ? (
                    <>
                      <User className="h-2.5 w-2.5" />
                      {getAssigneeName(newAssignee)}
                    </>
                  ) : (newDepartmentId || newContractorId) ? (
                    <AssigneeBadge departmentId={newDepartmentId} contractorId={newContractorId} />
                  ) : (
                    <>
                      <User className="h-2.5 w-2.5" />
                      Ответственный
                    </>
                  )}
                </button>
              }
            />
            {(newAssignee || newDepartmentId || newContractorId) && (
              <button onClick={() => { setNewAssignee(null); setNewDepartmentId(null); setNewContractorId(null); }} className="text-muted-foreground hover:text-foreground">
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
