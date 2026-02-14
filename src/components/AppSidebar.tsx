import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTags, useTaskMutations } from "@/hooks/useTasks";
import { Link } from "react-router-dom";
import {
  CheckSquare, List, Star, CalendarDays, Users, Tag, Plus, Trash2, LogOut, ChevronDown, ChevronRight, UserPlus, Share2, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import ConfirmDelete from "@/components/ConfirmDelete";

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
  const { addGroup, renameGroup, deleteGroup, addTag, renameTag, deleteTag, addGroupMember, grantTagAccess } = useTaskMutations();
  const [newGroupName, setNewGroupName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [showGroups, setShowGroups] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewTag, setShowNewTag] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [tagShareEmail, setTagShareEmail] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");

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
    { id: "calendar", icon: CalendarDays, label: "Календарь" },
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

  const handleInvite = (groupId: string) => {
    if (inviteEmail.trim()) {
      addGroupMember.mutate({ group_id: groupId, user_email: inviteEmail.trim() });
      setInviteEmail("");
    }
  };

  const handleShareTag = (tagId: string) => {
    if (tagShareEmail.trim()) {
      grantTagAccess.mutate({ tag_id: tagId, user_email: tagShareEmail.trim() });
      setTagShareEmail("");
    }
  };

  const handleSaveGroupName = (id: string) => {
    if (editingGroupName.trim()) {
      renameGroup.mutate({ id, name: editingGroupName.trim() });
    }
    setEditingGroupId(null);
  };

  const handleSaveTagName = (id: string) => {
    if (editingTagName.trim()) {
      renameTag.mutate({ id, name: editingTagName.trim() });
    }
    setEditingTagId(null);
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

        {/* Projects section */}
        <div className="pt-4">
          <button
            onClick={() => setShowGroups(!showGroups)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs uppercase tracking-wider text-sidebar-fg/60 hover:text-sidebar-fg/80"
          >
            {showGroups ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Проекты
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
                <div key={g.id} className="group">
                  <button
                    onClick={() => { onGroupChange(g.id); onViewChange("group"); onTagFilter(null); }}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                      activeGroupId === g.id
                        ? "bg-sidebar-active text-sidebar-fg"
                        : "text-sidebar-fg/80 hover:bg-sidebar-hover"
                    )}
                  >
                    <div className="h-3 w-3 rounded" style={{ backgroundColor: g.color || undefined }} />
                    {editingGroupId === g.id ? (
                      <input
                        autoFocus
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onBlur={() => handleSaveGroupName(g.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveGroupName(g.id); if (e.key === "Escape") setEditingGroupId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
                      />
                    ) : (
                      <span
                        className="truncate flex-1 text-left"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingGroupId(g.id); setEditingGroupName(g.name); }}
                      >
                        {g.name}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <span
                            onClick={(e) => e.stopPropagation()}
                            className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-3" side="right" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Пригласить участника</p>
                          <form onSubmit={(e) => { e.preventDefault(); handleInvite(g.id); }} className="flex gap-2">
                            <Input
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              placeholder="Email..."
                              className="h-7 text-xs"
                            />
                            <button type="submit" disabled={!inviteEmail.trim()} className="text-xs text-primary hover:text-primary/80 whitespace-nowrap disabled:opacity-30">
                              Добавить
                            </button>
                          </form>
                        </PopoverContent>
                      </Popover>
                      <ConfirmDelete title="Удалить проект?" description="Все задачи проекта останутся, но потеряют привязку." onConfirm={() => deleteGroup.mutate(g.id)}>
                        <span
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </ConfirmDelete>
                    </div>
                  </button>
                </div>
              ))}
              {showNewGroup && (
                <form onSubmit={(e) => { e.preventDefault(); handleAddGroup(); }} className="px-3 py-1">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onBlur={() => { if (!newGroupName.trim()) setShowNewGroup(false); }}
                    placeholder="Название проекта..."
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
                <div key={t.id} className="group">
                  <button
                    onClick={() => { onTagFilter(activeTagFilter === t.id ? null : t.id); onViewChange("all"); onGroupChange(null); }}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                      activeTagFilter === t.id
                        ? "bg-sidebar-active text-sidebar-fg"
                        : "text-sidebar-fg/80 hover:bg-sidebar-hover"
                    )}
                  >
                    <Tag className="h-3.5 w-3.5" style={{ color: t.color || undefined }} />
                    {editingTagId === t.id ? (
                      <input
                        autoFocus
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        onBlur={() => handleSaveTagName(t.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveTagName(t.id); if (e.key === "Escape") setEditingTagId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
                      />
                    ) : (
                      <span
                        className="truncate flex-1 text-left"
                        onDoubleClick={(e) => { e.stopPropagation(); setEditingTagId(t.id); setEditingTagName(t.name); }}
                      >
                        {t.name}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <span
                            onClick={(e) => e.stopPropagation()}
                            className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                          </span>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-3" side="right" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Дать доступ к тэгу</p>
                          <form onSubmit={(e) => { e.preventDefault(); handleShareTag(t.id); }} className="flex gap-2">
                            <Input
                              value={tagShareEmail}
                              onChange={(e) => setTagShareEmail(e.target.value)}
                              placeholder="Email..."
                              className="h-7 text-xs"
                            />
                            <button type="submit" disabled={!tagShareEmail.trim()} className="text-xs text-primary hover:text-primary/80 whitespace-nowrap disabled:opacity-30">
                              Дать
                            </button>
                          </form>
                        </PopoverContent>
                      </Popover>
                      <ConfirmDelete title="Удалить тэг?" description="Тэг будет снят со всех задач." onConfirm={() => deleteTag.mutate(t.id)}>
                        <span
                          onClick={(e) => e.stopPropagation()}
                          className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </ConfirmDelete>
                    </div>
                  </button>
                </div>
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
          <Link to="/settings" className="text-sidebar-fg/60 hover:text-sidebar-fg">
            <Settings className="h-4 w-4" />
          </Link>
          <button onClick={signOut} className="text-sidebar-fg/60 hover:text-sidebar-fg">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
