import { useState, useMemo } from "react";
import { TaskGroup, useTaskMutations, useGroupMembers, useAvailableUsers, Profile } from "@/hooks/useTasks";
import { FileText, UserPlus, Users, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ProjectDetailPanelProps {
  group: TaskGroup;
}

export default function ProjectDetailPanel({ group }: ProjectDetailPanelProps) {
  const { updateGroupDescription, addGroupMember, removeGroupMember } = useTaskMutations();
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
      return (u.display_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.telegram_username?.toLowerCase().includes(q));
    });
  }, [availableUsers, members, userSearch]);

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || p?.email || userId.slice(0, 8);
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
            <span className="text-xs text-muted-foreground">{u.email}{u.telegram_username ? ` · @${u.telegram_username}` : ""}</span>
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
    </div>
  );
}
