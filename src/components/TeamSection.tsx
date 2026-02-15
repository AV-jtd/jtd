import { useState } from "react";
import { useTeams, useTeamMembers, useTeamMutations } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Copy, Trash2, LogIn, Crown, User, Check, UserPlus, Shield, Send } from "lucide-react";
import { toast } from "sonner";
import ConfirmDelete from "@/components/ConfirmDelete";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  director: "Директор",
  manager: "Менеджер",
  member: "Участник",
};

const ROLE_ICONS: Record<string, typeof Crown> = {
  director: Crown,
  manager: Shield,
  member: User,
};

const ROLE_COLORS: Record<string, string> = {
  director: "text-amber-500",
  manager: "text-blue-500",
  member: "text-muted-foreground",
};

export default function TeamSection() {
  const { user } = useAuth();
  const { data: teams = [] } = useTeams();
  const { createTeam, joinTeam, deleteTeam, removeMember, inviteMember } = useTeamMutations();
  const [newTeamName, setNewTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Invite form state
  const [inviteValue, setInviteValue] = useState("");
  const [inviteType, setInviteType] = useState<"email" | "user_id" | "telegram">("email");
  const [inviteRole, setInviteRole] = useState<"member" | "manager">("member");

  const { data: members = [] } = useTeamMembers(selectedTeamId);

  const handleCreate = () => {
    if (newTeamName.trim()) {
      createTeam.mutate(newTeamName.trim());
      setNewTeamName("");
    }
  };

  const handleJoin = () => {
    if (joinCode.trim()) {
      joinTeam.mutate(joinCode.trim());
      setJoinCode("");
    }
  };

  const handleInvite = (teamId: string) => {
    if (!inviteValue.trim()) return;
    inviteMember.mutate(
      {
        teamId,
        email: inviteType === "email" ? inviteValue.trim() : undefined,
        userId: inviteType === "user_id" ? inviteValue.trim() : undefined,
        telegram: inviteType === "telegram" ? inviteValue.trim() : undefined,
        role: inviteRole,
      },
      {
        onSuccess: () => setInviteValue(""),
      }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Код скопирован");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const isDirector = (teamId: string) => {
    return teams.some(t => t.id === teamId && t.created_by === user?.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-medium">Команды</h2>
      </div>

      {/* Create team */}
      <div className="space-y-2">
        <Label>Создать команду</Label>
        <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="flex gap-2">
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Название команды..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newTeamName.trim() || createTeam.isPending} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Создать
          </Button>
        </form>
      </div>

      {/* Join team */}
      <div className="space-y-2">
        <Label>Присоединиться по коду</Label>
        <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="flex gap-2">
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Введите код..."
            className="flex-1"
          />
          <Button type="submit" disabled={!joinCode.trim() || joinTeam.isPending} size="sm" variant="outline">
            <LogIn className="h-4 w-4 mr-1" />
            Войти
          </Button>
        </form>
      </div>

      {/* Teams list */}
      {teams.length > 0 && (
        <div className="space-y-2 pt-2">
          <Label>Ваши команды</Label>
          <div className="space-y-2">
            {teams.map((team) => (
              <div
                key={team.id}
                className={cn(
                  "rounded-lg border border-border p-3 cursor-pointer transition-colors",
                  selectedTeamId === team.id ? "bg-accent/50 border-primary/30" : "bg-card hover:bg-accent/30"
                )}
                onClick={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)}
              >
                <div className="flex items-center gap-2">
                  {isDirector(team.id) ? (
                    <Crown className="h-4 w-4 text-amber-500" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm flex-1">{team.name}</span>
                  {isDirector(team.id) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyCode(team.invite_code); }}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded bg-muted/50"
                      >
                        {copiedCode === team.invite_code ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {team.invite_code}
                      </button>
                      <ConfirmDelete title="Удалить команду?" description="Все участники потеряют доступ." onConfirm={() => deleteTeam.mutate(team.id)}>
                        <button onClick={(e) => e.stopPropagation()} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </ConfirmDelete>
                    </div>
                  )}
                </div>

                {/* Expanded content */}
                {selectedTeamId === team.id && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
                    {/* Invite form (director only) */}
                    {isDirector(team.id) && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <UserPlus className="h-3.5 w-3.5" />
                          Пригласить участника
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Select
                            value={inviteType}
                            onValueChange={(v) => setInviteType(v as "email" | "user_id" | "telegram")}
                          >
                            <SelectTrigger className="w-[110px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="telegram">Telegram</SelectItem>
                              <SelectItem value="user_id">User ID</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={inviteValue}
                            onChange={(e) => setInviteValue(e.target.value)}
                            placeholder={
                              inviteType === "email" ? "email@example.com" :
                              inviteType === "telegram" ? "@username" :
                              "UUID пользователя"
                            }
                            className="flex-1 h-8 text-xs min-w-[140px]"
                          />
                          <Select
                            value={inviteRole}
                            onValueChange={(v) => setInviteRole(v as "member" | "manager")}
                          >
                            <SelectTrigger className="w-[120px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Участник</SelectItem>
                              <SelectItem value="manager">Менеджер</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!inviteValue.trim() || inviteMember.isPending}
                            onClick={() => handleInvite(team.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            Добавить
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Members list */}
                    {members.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Участники</p>
                        {members.map((m) => {
                          const RoleIcon = ROLE_ICONS[m.role] || User;
                          const roleColor = ROLE_COLORS[m.role] || "text-muted-foreground";
                          return (
                            <div key={m.id} className="flex items-center gap-2 text-sm py-1">
                              <RoleIcon className={cn("h-3.5 w-3.5 shrink-0", roleColor)} />
                              <span className="truncate flex-1">
                                {m.profile?.display_name || m.profile?.email || "Пользователь"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {ROLE_LABELS[m.role] || m.role}
                              </span>
                              {isDirector(team.id) && m.user_id !== user?.id && (
                                <button
                                  onClick={() => removeMember.mutate({ teamId: team.id, memberId: m.user_id })}
                                  className="p-0.5 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
