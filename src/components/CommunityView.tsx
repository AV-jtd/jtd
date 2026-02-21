import { useState, useMemo } from "react";
import { useAvailableUsers, useTaskGroups, useTaskMutations, Profile } from "@/hooks/useTasks";
import { useTeams, useTeamMutations } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Search, UserPlus, FolderPlus, AtSign, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CommunityView() {
  const { user } = useAuth();
  const { data: allUsers = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();
  const { data: teams = [] } = useTeams();
  const { addGroupMember } = useTaskMutations();
  const { inviteMember } = useTeamMutations();
  const [search, setSearch] = useState("");

  const filteredUsers = useMemo(() => {
    const others = allUsers.filter(u => u.id !== user?.id);
    if (!search.trim()) return others;
    const q = search.toLowerCase();
    return others.filter(u =>
      u.display_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.telegram_username?.toLowerCase().includes(q)
    );
  }, [allUsers, user?.id, search]);

  const myGroups = groups.filter(g => !g.parent_id);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Сообщество</h1>
          <span className="text-sm text-muted-foreground">({filteredUsers.length})</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени, email, @telegram..."
            className="pl-10"
          />
        </div>

        {/* User list */}
        <div className="space-y-2">
          {filteredUsers.map(u => (
            <UserCard
              key={u.id}
              profile={u}
              myGroups={myGroups}
              teams={teams}
              onAddToGroup={(groupId) => {
                addGroupMember.mutate(
                  { group_id: groupId, user_id: u.id },
                  { onError: (e) => toast.error(e.message) }
                );
              }}
              onAddToTeam={(teamId, role) => {
                inviteMember.mutate(
                  { teamId, userId: u.id, role },
                  { onError: (e) => toast.error(e.message) }
                );
              }}
            />
          ))}
          {filteredUsers.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {search ? "Никого не найдено" : "Пока нет других пользователей"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function UserCard({
  profile,
  myGroups,
  teams,
  onAddToGroup,
  onAddToTeam,
}: {
  profile: Profile;
  myGroups: { id: string; name: string; icon?: string | null }[];
  teams: { id: string; name: string; created_by: string }[];
  onAddToGroup: (groupId: string) => void;
  onAddToTeam: (teamId: string, role: string) => void;
}) {
  const { user } = useAuth();
  const myTeams = teams.filter(t => t.created_by === user?.id);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/30 transition-colors">
      {/* Avatar */}
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
        {profile.display_name?.[0]?.toUpperCase() || profile.email?.[0]?.toUpperCase() || "?"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{profile.display_name || "Без имени"}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Add to project */}
        {myGroups.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Добавить в проект">
                <FolderPlus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="left">
              <p className="text-xs font-medium text-muted-foreground mb-2 px-2">В проект</p>
              {myGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => onAddToGroup(g.id)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors truncate"
                >
                  {g.icon && g.icon !== "list" ? `${g.icon} ` : ""}{g.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Add to team */}
        {myTeams.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Добавить в команду">
                <UserPlus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="left">
              <p className="text-xs font-medium text-muted-foreground mb-2 px-2">В команду</p>
              {myTeams.map(t => (
                <button
                  key={t.id}
                  onClick={() => onAddToTeam(t.id, "member")}
                  className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors truncate"
                >
                  {t.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
