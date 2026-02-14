import { useState } from "react";
import { useTeams, useTeamMembers, useTeamMutations, useSubordinateTasks } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Users, Plus, Copy, Trash2, LogIn, Crown, User, Check } from "lucide-react";
import { toast } from "sonner";
import ConfirmDelete from "@/components/ConfirmDelete";
import { cn } from "@/lib/utils";

export default function TeamSection() {
  const { user } = useAuth();
  const { data: teams = [] } = useTeams();
  const { createTeam, joinTeam, deleteTeam, removeMember } = useTeamMutations();
  const [newTeamName, setNewTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

                {/* Members */}
                {selectedTeamId === team.id && members.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Участники</p>
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 text-sm py-1">
                        {m.role === "director" ? (
                          <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="truncate flex-1">
                          {m.profile?.display_name || m.profile?.email || "Пользователь"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {m.role === "director" ? "Директор" : "Участник"}
                        </span>
                        {isDirector(team.id) && m.user_id !== user?.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeMember.mutate({ teamId: team.id, memberId: m.user_id }); }}
                            className="p-0.5 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
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
