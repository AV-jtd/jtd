import { useState, useMemo } from "react";
import { TaskGroup, useTaskMutations, useGroupMembers, useAvailableUsers, useTaskGroups, Profile } from "@/hooks/useTasks";
import { FileText, UserPlus, Users, Plus, X, FolderOpen, Download, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { exportProjectToCsv, downloadCsv } from "@/lib/projectCsv";
import ImportProjectDialog from "@/components/ImportProjectDialog";
import { toast } from "sonner";

interface ProjectDetailPanelProps {
  group: TaskGroup;
}

export default function ProjectDetailPanel({ group }: ProjectDetailPanelProps) {
  const { updateGroupDescription, addGroupMember, removeGroupMember, updateGroupParent } = useTaskMutations();
  const { data: allGroups = [] } = useTaskGroups();
  const { data: members = [] } = useGroupMembers(group.id);
  const { data: availableUsers = [] } = useAvailableUsers();
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState((group as any).description || "");
  const [userSearch, setUserSearch] = useState("");
  const [userPickerOpen, setUserPickerOpen] = useState<"assignee" | "participant" | null>(null);

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
          <button
            onClick={async () => {
              try {
                const csv = await exportProjectToCsv(group.id);
                downloadCsv(csv, `${group.name}.csv`);
                toast.success("CSV экспортирован");
              } catch (err: any) {
                toast.error("Ошибка экспорта: " + err.message);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <Upload className="h-3 w-3" /> Экспорт CSV
          </button>
          <ImportProjectDialog
            targetGroupId={group.id}
            trigger={
              <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                <Upload className="h-3 w-3" /> Импорт CSV
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
