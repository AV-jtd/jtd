import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTags, useTaskMutations } from "@/hooks/useTasks";
import {
  CheckSquare, List, Star, CalendarDays, Users, Tag, Plus, Trash2, LogOut, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  activeGroupId: string | null;
  onGroupChange: (id: string | null) => void;
  activeTagFilter: string | null;
  onTagFilter: (id: string | null) => void;
}

export default function AppSidebar({
  activeView, onViewChange, activeGroupId, onGroupChange, activeTagFilter, onTagFilter,
}: AppSidebarProps) {
  const { user, signOut } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: tags = [] } = useTags();
  const { addGroup, deleteGroup, addTag, deleteTag } = useTaskMutations();
  const [newGroupName, setNewGroupName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [showGroups, setShowGroups] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewTag, setShowNewTag] = useState(false);

  const tagColors = [
    "hsl(var(--tag-blue))", "hsl(var(--tag-green))", "hsl(var(--tag-orange))",
    "hsl(var(--tag-purple))", "hsl(var(--tag-red))", "hsl(var(--tag-yellow))",
    "hsl(var(--tag-pink))", "hsl(var(--tag-teal))",
  ];

  const menuItems = [
    { id: "all", icon: List, label: "Все задачи" },
    { id: "important", icon: Star, label: "Важные" },
    { id: "today", icon: CalendarDays, label: "На сегодня" },
    { id: "assigned", icon: Users, label: "Делегированные" },
  ];

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup.mutate(newGroupName.trim());
      setNewGroupName("");
      setShowNewGroup(false);
    }
  };

  const handleAddTag = () => {
    if (newTagName.trim()) {
      const color = tagColors[tags.length % tagColors.length];
      addTag.mutate({ name: newTagName.trim(), color });
      setNewTagName("");
      setShowNewTag(false);
    }
  };

  return (
    <aside className="w-72 bg-sidebar-bg text-sidebar-fg flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <CheckSquare className="h-6 w-6" />
          <span className="text-xl font-semibold">TaskFlow</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 space-y-0.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { onViewChange(item.id); onGroupChange(null); onTagFilter(null); }}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              activeView === item.id && !activeGroupId
                ? "bg-sidebar-active text-sidebar-fg"
                : "text-sidebar-fg/80 hover:bg-sidebar-hover"
            )}
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </button>
        ))}

        {/* Groups section */}
        <div className="pt-4">
          <button
            onClick={() => setShowGroups(!showGroups)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs uppercase tracking-wider text-sidebar-fg/60 hover:text-sidebar-fg/80"
          >
            {showGroups ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Группы
            <button
              onClick={(e) => { e.stopPropagation(); setShowNewGroup(true); }}
              className="ml-auto hover:text-sidebar-fg"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </button>
          {showGroups && (
            <div className="space-y-0.5 mt-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { onGroupChange(g.id); onViewChange("group"); onTagFilter(null); }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors group",
                    activeGroupId === g.id
                      ? "bg-sidebar-active text-sidebar-fg"
                      : "text-sidebar-fg/80 hover:bg-sidebar-hover"
                  )}
                >
                  <div className="h-3 w-3 rounded" style={{ backgroundColor: g.color || undefined }} />
                  <span className="truncate flex-1 text-left">{g.name}</span>
                  <Trash2
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteGroup.mutate(g.id); }}
                  />
                </button>
              ))}
              {showNewGroup && (
                <form onSubmit={(e) => { e.preventDefault(); handleAddGroup(); }} className="px-3 py-1">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onBlur={() => { if (!newGroupName.trim()) setShowNewGroup(false); }}
                    placeholder="Название группы..."
                    className="w-full bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                  />
                </form>
              )}
            </div>
          )}
        </div>

        {/* Tags section */}
        <div className="pt-4">
          <button
            onClick={() => setShowTags(!showTags)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs uppercase tracking-wider text-sidebar-fg/60 hover:text-sidebar-fg/80"
          >
            {showTags ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Тэги
            <button
              onClick={(e) => { e.stopPropagation(); setShowNewTag(true); }}
              className="ml-auto hover:text-sidebar-fg"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </button>
          {showTags && (
            <div className="space-y-0.5 mt-1">
              {tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { onTagFilter(activeTagFilter === t.id ? null : t.id); onViewChange("all"); onGroupChange(null); }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors group",
                    activeTagFilter === t.id
                      ? "bg-sidebar-active text-sidebar-fg"
                      : "text-sidebar-fg/80 hover:bg-sidebar-hover"
                  )}
                >
                  <Tag className="h-3.5 w-3.5" style={{ color: t.color || undefined }} />
                  <span className="truncate flex-1 text-left">{t.name}</span>
                  <Trash2
                    className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteTag.mutate(t.id); }}
                  />
                </button>
              ))}
              {showNewTag && (
                <form onSubmit={(e) => { e.preventDefault(); handleAddTag(); }} className="px-3 py-1">
                  <input
                    autoFocus
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onBlur={() => { if (!newTagName.trim()) setShowNewTag(false); }}
                    placeholder="Название тэга..."
                    className="w-full bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                  />
                </form>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-fg/10">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-sidebar-hover flex items-center justify-center text-sm font-medium">
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm truncate flex-1">{user?.email}</span>
          <button onClick={signOut} className="text-sidebar-fg/60 hover:text-sidebar-fg">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
