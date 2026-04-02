import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTags, useTagCategories, useTaskMutations, TaskGroup, useAvailableUsers, useGroupMembers, useProjectFolders, useProjectFolderItems, useLinkedTagIds } from "@/hooks/useTasks";
import { Link, useNavigate } from "react-router-dom";
import {
  List, Star, CalendarDays, Users, Tag, Plus, Trash2, LogOut, ChevronDown, ChevronRight, UserPlus, Share2, Settings, GripVertical, UsersRound, Archive, BarChart3, Expand, Globe, Send, Clock, FolderOpen, FolderPlus, Download, Inbox, BookOpen,
} from "lucide-react";

import SmartImportDialog from "@/components/SmartImportDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import ConfirmDelete from "@/components/ConfirmDelete";
import GroupIcon from "@/components/sidebar/GroupIcon";
import HueSlider from "@/components/sidebar/HueSlider";
import { DroppableFolder, DroppableUngrouped } from "@/components/sidebar/SidebarDroppables";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent, DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

import { EMOJI_CATEGORIES } from "@/lib/emojiCategories";
const COLOR_PRESETS = [
  { hue: 220, label: "Синий" },
  { hue: 160, label: "Зелёный" },
  { hue: 40, label: "Жёлтый" },
  { hue: 270, label: "Фиолет" },
  { hue: 0, label: "Красный" },
  { hue: 330, label: "Розовый" },
  { hue: 190, label: "Голубой" },
  { hue: 90, label: "Лайм" },
  { hue: 25, label: "Оранж" },
];

interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  activeGroupId: string | null;
  onGroupChange: (id: string | null) => void;
  activeTagFilters: string[];
  onToggleTag: (id: string) => void;
  onClearTags: () => void;
  projectDetailOpen: boolean;
  onToggleProjectDetail: () => void;
}

export default function AppSidebar({
  activeView, onViewChange, activeGroupId, onGroupChange, activeTagFilters, onToggleTag, onClearTags, projectDetailOpen, onToggleProjectDetail,
}: AppSidebarProps) {
  const { user, signOut } = useAuth();
  const navigateTo = useNavigate();
  const { data: groups = [] } = useTaskGroups();
  const { data: allTags = [] } = useTags();
  const linkedTagIds = useLinkedTagIds();
  const tags = useMemo(() => allTags.filter(t => !linkedTagIds.has(t.id)), [allTags, linkedTagIds]);
  const { data: tagCategories = [] } = useTagCategories();
  const { data: folders = [] } = useProjectFolders();
  const { data: folderItems = [] } = useProjectFolderItems();
  const { addGroup, renameGroup, deleteGroup, updateGroupAppearance, addTag, renameTag, deleteTag, addGroupMember, addGroupMemberByEmail, removeGroupMember, grantTagAccess, reorderGroups, addProjectFolder, renameProjectFolder, deleteProjectFolder, moveProjectToFolder, updateFolderColor, addTagCategory, renameTagCategory, deleteTagCategory, updateTagCategory } = useTaskMutations();
  const { data: availableUsers = [] } = useAvailableUsers();
  const [newGroupName, setNewGroupName] = useState("");
  const [newSubgroupParentId, setNewSubgroupParentId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [showGroups, setShowGroups] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [tagShareEmail, setTagShareEmail] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPickerGroupId, setMemberPickerGroupId] = useState<string | null>(null);
  const [emojiPickerGroupId, setEmojiPickerGroupId] = useState<string | null>(null);
  const [emojiTab, setEmojiTab] = useState(0);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderPickerGroupId, setFolderPickerGroupId] = useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["__uncategorized__"]));
  const [newTagCategoryId, setNewTagCategoryId] = useState<string | null>(null);
  const [newSubcategoryParentId, setNewSubcategoryParentId] = useState<string | null>(null);
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const tagColors = [
    "hsl(var(--tag-blue))", "hsl(var(--tag-green))", "hsl(var(--tag-orange))",
    "hsl(var(--tag-purple))", "hsl(var(--tag-red))", "hsl(var(--tag-yellow))",
    "hsl(var(--tag-pink))", "hsl(var(--tag-teal))",
  ];

  const menuItems = [
    { id: "all", icon: List, label: "Все задачи" },
    { id: "inbox", icon: Inbox, label: "Входящие" },
    { id: "myday", icon: Star, label: "Мой день" },
    { id: "assigned", icon: Users, label: "Делегированные" },
    { id: "deferred", icon: Clock, label: "Отложенные" },
    { id: "subordinates", icon: UsersRound, label: "Команда" },
    { id: "community", icon: Globe, label: "Сообщество" },
    { id: "calendar", icon: CalendarDays, label: "Календарь" },
    { id: "dashboard", icon: BarChart3, label: "Дашборд" },
    { id: "wiki", icon: BookOpen, label: "База знаний" },
    { id: "archive", icon: Archive, label: "Архив" },
  ];

  // Separate root groups and subgroups — hide archived
  const rootGroups = groups.filter(g => !g.parent_id && !(g as any).closed_at);
  const archivedGroups = groups.filter(g => !g.parent_id && (g as any).closed_at);
  const [showArchived, setShowArchived] = useState(false);
  const getChildren = (parentId: string) => groups.filter(g => g.parent_id === parentId);

  // Build a map: my category id -> Set of all category ids (mine + others') with matching name+parent_name
  const categoryIdMapping = useMemo(() => {
    const myCats = tagCategories.filter(c => c.user_id === user?.id);
    const otherCats = tagCategories.filter(c => c.user_id !== user?.id);
    const catNameById = new Map(tagCategories.map(c => [c.id, c.name]));
    const catParentById = new Map(tagCategories.map(c => [c.id, c.parent_id]));

    // Build a "path" key for a category: parentName/name (or just name for root)
    const getPathKey = (cat: { id: string; name: string; parent_id?: string | null }) => {
      const parentName = cat.parent_id ? catNameById.get(cat.parent_id) || "" : "";
      return parentName ? `${parentName}/${cat.name}` : cat.name;
    };

    const mapping = new Map<string, Set<string>>();
    for (const myCat of myCats) {
      const key = getPathKey(myCat);
      const matchingIds = new Set([myCat.id]);
      for (const other of otherCats) {
        if (getPathKey(other) === key) {
          matchingIds.add(other.id);
        }
      }
      mapping.set(myCat.id, matchingIds);
    }
    return mapping;
  }, [tagCategories, user?.id]);

  // All category IDs that are "claimed" by the user's tree
  const allMappedCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    categoryIdMapping.forEach(set => set.forEach(id => ids.add(id)));
    return ids;
  }, [categoryIdMapping]);

  // Folder grouping: map group_id -> folder_id
  const groupFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    folderItems.forEach(fi => map.set(fi.group_id, fi.folder_id));
    return map;
  }, [folderItems]);

  const npdRootGroups = rootGroups.filter(g => (g as any).project_type === 'npd');
  const nonNpdRootGroups = rootGroups.filter(g => (g as any).project_type !== 'npd');
  const getGroupsInFolder = (folderId: string) => nonNpdRootGroups.filter(g => groupFolderMap.get(g.id) === folderId);
  const ungroupedProjects = nonNpdRootGroups.filter(g => !groupFolderMap.has(g.id));

  const toggleFolderExpand = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveFolderName = (id: string) => {
    if (editingFolderName.trim()) {
      renameProjectFolder.mutate({ id, name: editingFolderName.trim() });
    }
    setEditingFolderId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleProjectDragStart = useCallback((event: DragStartEvent) => {
    setDraggingProjectId(event.active.id as string);
  }, []);

  const handleProjectDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setDragOverFolderId(null); return; }
    const overId = over.id as string;
    // Check if over a folder droppable
    if (overId.startsWith("folder:")) {
      setDragOverFolderId(overId.replace("folder:", ""));
    } else if (overId === "ungrouped-drop") {
      setDragOverFolderId("__ungrouped__");
    } else {
      setDragOverFolderId(null);
    }
  }, []);

  const handleProjectDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingProjectId(null);
    setDragOverFolderId(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Dropped on a folder
    if (overId.startsWith("folder:")) {
      const folderId = overId.replace("folder:", "");
      const currentFolder = groupFolderMap.get(activeId);
      if (currentFolder !== folderId) {
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: folderId });
      }
      return;
    }

    // Dropped on ungrouped zone
    if (overId === "ungrouped-drop") {
      if (groupFolderMap.has(activeId)) {
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: null });
      }
      return;
    }

    // Dropped on another project — reorder within ungrouped or move to same folder
    const overProject = rootGroups.find(g => g.id === overId);
    if (!overProject) return;
    const overFolder = groupFolderMap.get(overId) || null;
    const activeFolder = groupFolderMap.get(activeId) || null;

    if (activeFolder !== overFolder) {
      // Move to the target's folder
      moveProjectToFolder.mutate({ group_id: activeId, folder_id: overFolder });
    } else if (!activeFolder) {
      // Reorder within ungrouped
      const oldIndex = ungroupedProjects.findIndex(g => g.id === activeId);
      const newIndex = ungroupedProjects.findIndex(g => g.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(ungroupedProjects, oldIndex, newIndex);
        reorderGroups.mutate(reordered.map((g, i) => ({ id: g.id, position: i })));
      }
    }
  }, [rootGroups, ungroupedProjects, groupFolderMap, reorderGroups, moveProjectToFolder]);

  const handleAddGroup = (parentId?: string | null) => {
    if (newGroupName.trim()) {
      addGroup.mutate({ name: newGroupName.trim(), parent_id: parentId || null });
      setNewGroupName("");
      setShowNewGroup(false);
      setNewSubgroupParentId(null);
    }
  };

  const handleAddTag = (categoryId?: string | null) => {
    if (newTagName.trim()) {
      const color = tagColors[tags.length % tagColors.length];
      addTag.mutate({ name: newTagName.trim(), color, category_id: categoryId || null });
      setNewTagName("");
      setNewTagCategoryId(null);
    }
  };

  const handleAddCategory = (parentId?: string | null) => {
    if (newCategoryName.trim()) {
      addTagCategory.mutate({ name: newCategoryName.trim(), parent_id: parentId || null });
      setNewCategoryName("");
      setShowNewCategory(false);
    }
  };

  const handleSaveCategoryName = (id: string) => {
    if (editingCategoryName.trim()) {
      renameTagCategory.mutate({ id, name: editingCategoryName.trim() });
    }
    setEditingCategoryId(null);
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const handleInvite = (groupId: string) => {
    if (inviteEmail.trim()) {
      addGroupMemberByEmail.mutate({ group_id: groupId, user_email: inviteEmail.trim() });
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
  // HueSlider, GroupIcon, DroppableFolder, DroppableUngrouped are now in separate files

  function GroupItem({ group, depth = 0 }: { group: TaskGroup; depth?: number }) {
    const children = getChildren(group.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedGroups.has(group.id);
    const isRoot = depth === 0;

    const {
      attributes, listeners, setNodeRef, transform, transition, isDragging,
    } = useSortable({ id: group.id, disabled: !isRoot });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70 z-50 relative" : ""}>
        <div className="group">
          <button
            onClick={() => { onGroupChange(group.id); onViewChange("group"); onClearTags(); }}
            className={cn(
              "flex items-center gap-2 w-full rounded-lg text-sm transition-colors",
              depth === 0 ? "px-3 py-2" : "px-3 py-1.5",
              activeGroupId === group.id
                ? "bg-sidebar-active text-sidebar-fg"
                : "text-sidebar-fg/80 hover:bg-sidebar-hover"
            )}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            {/* Drag handle */}
            {isRoot && (
              <span
                {...attributes}
                {...listeners}
                className="shrink-0 text-sidebar-fg/30 hover:text-sidebar-fg/60 cursor-grab active:cursor-grabbing touch-none"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            )}
            {/* Expand toggle */}
            {isRoot && (
              <span
                onClick={(e) => { e.stopPropagation(); toggleExpand(group.id); }}
                className="shrink-0 cursor-pointer text-sidebar-fg/50 hover:text-sidebar-fg/80"
              >
                {hasChildren || true ? (
                  isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                ) : <span className="w-3" />}
              </span>
            )}

            {/* Icon/Emoji with picker */}
            <Popover open={emojiPickerGroupId === group.id} onOpenChange={(open) => { if (!open) setEmojiPickerGroupId(null); else setEmojiPickerGroupId(group.id); }}>
              <PopoverTrigger asChild>
                <span onClick={(e) => e.stopPropagation()} className="shrink-0 cursor-pointer hover:opacity-80">
                  <GroupIcon group={group} />
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" side="right" onClick={(e) => e.stopPropagation()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Эмодзи</p>
                <div className="flex gap-1 mb-2 flex-wrap">
                  {EMOJI_CATEGORIES.map((cat, i) => (
                    <button
                      key={cat.label}
                      onClick={(e) => { e.stopPropagation(); setEmojiTab(i); }}
                      className={cn("text-[10px] px-1.5 py-0.5 rounded-full transition-colors", emojiTab === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-8 gap-0.5 mb-2">
                  {EMOJI_CATEGORIES[emojiTab].emojis.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => { updateGroupAppearance.mutate({ id: group.id, icon: emoji }); setEmojiPickerGroupId(null); }}
                      className={cn("p-1 rounded hover:bg-accent text-sm", group.icon === emoji && "bg-accent ring-1 ring-primary")}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { updateGroupAppearance.mutate({ id: group.id, icon: "list" }); setEmojiPickerGroupId(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground mb-3 block"
                >
                  Убрать эмодзи
                </button>
                <p className="text-xs font-medium text-muted-foreground mb-2">Цвет</p>
                <div className="flex gap-1 mb-2 flex-wrap">
                  {COLOR_PRESETS.map(p => (
                    <button
                      key={p.hue}
                      onClick={() => { updateGroupAppearance.mutate({ id: group.id, color: `hsl(${p.hue}, 70%, 50%)`, icon: group.icon === "list" ? "list" : undefined }); setEmojiPickerGroupId(null); }}
                      className={cn("h-5 w-5 rounded-full transition-transform hover:scale-110 border border-border/50")}
                      style={{ backgroundColor: `hsl(${p.hue}, 70%, 50%)` }}
                      title={p.label}
                    />
                  ))}
                </div>
                <HueSlider group={group} onColorChange={(id, color) => updateGroupAppearance.mutate({ id, color, icon: group.icon === "list" ? "list" : undefined })} onDone={() => setEmojiPickerGroupId(null)} />
              </PopoverContent>
            </Popover>

            {/* Name */}
            {editingGroupId === group.id ? (
              <input
                autoFocus
                enterKeyHint="done"
                value={editingGroupName}
                onChange={(e) => setEditingGroupName(e.target.value)}
                onBlur={() => handleSaveGroupName(group.id)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveGroupName(group.id); if (e.key === "Escape") setEditingGroupId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
              />
            ) : (
              <span
                className="truncate flex-1 text-left"
                onDoubleClick={(e) => { e.stopPropagation(); setEditingGroupId(group.id); setEditingGroupName(group.name); }}
              >
                {group.name}
              </span>
            )}

            {/* Actions */}
            <div className={cn("items-center gap-0.5 shrink-0", activeGroupId === group.id ? "flex opacity-60" : "hidden group-hover:flex")}>
              {isRoot && (
                <span
                  onClick={(e) => { e.stopPropagation(); setNewSubgroupParentId(group.id); setExpandedGroups(prev => new Set(prev).add(group.id)); }}
                  className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
                  title="Добавить подпроект"
                >
                  <Plus className="h-3.5 w-3.5" />
                </span>
              )}
              <Popover open={memberPickerGroupId === group.id} onOpenChange={(open) => { setMemberPickerGroupId(open ? group.id : null); setMemberSearch(""); }}>
                <PopoverTrigger asChild>
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" side="right" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Добавить участника</p>
                  <Input
                    autoFocus
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Поиск по имени..."
                    className="h-7 text-xs mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {(() => {
                      const filtered = availableUsers.filter(u => {
                        if (!memberSearch.trim()) return true;
                        const q = memberSearch.toLowerCase();
                        return u.display_name?.toLowerCase().includes(q);
                      });
                      return filtered.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                      ) : filtered.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            addGroupMember.mutate({ group_id: group.id, user_id: u.id, role: "participant" });
                            setMemberPickerGroupId(null);
                            setMemberSearch("");
                          }}
                          className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
                        >
                           <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
                        </button>
                      ));
                    })()}
                  </div>
                </PopoverContent>
              </Popover>
              <span
                onClick={(e) => { e.stopPropagation(); onGroupChange(group.id); onViewChange("group"); onClearTags(); onToggleProjectDetail(); }}
                className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
                title="Карточка проекта"
              >
                <Expand className="h-3.5 w-3.5" />
               </span>
              {/* Move to folder */}
              {isRoot && folders.length > 0 && (
                <Popover open={folderPickerGroupId === group.id} onOpenChange={(open) => setFolderPickerGroupId(open ? group.id : null)}>
                  <PopoverTrigger asChild>
                    <span
                      onClick={(e) => e.stopPropagation()}
                      className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
                      title="Переместить в папку"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1.5" side="right" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs font-medium text-muted-foreground px-2 py-1">Папка</p>
                    {groupFolderMap.has(group.id) && (
                      <button
                        onClick={() => { moveProjectToFolder.mutate({ group_id: group.id, folder_id: null }); setFolderPickerGroupId(null); }}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground"
                      >
                        Без папки
                      </button>
                    )}
                    {folders.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { moveProjectToFolder.mutate({ group_id: group.id, folder_id: f.id }); setFolderPickerGroupId(null); }}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                          groupFolderMap.get(group.id) === f.id && "bg-muted text-primary font-medium"
                        )}
                      >
                        <FolderOpen className="h-3 w-3" />
                        {f.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
              
              <ConfirmDelete title="Удалить проект?" description={isRoot && hasChildren ? "Все подпроекты тоже будут удалены." : "Задачи потеряют привязку."} onConfirm={() => deleteGroup.mutate(group.id)}>
                <span onClick={(e) => e.stopPropagation()} className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </ConfirmDelete>
            </div>
          </button>
        </div>

        {/* Children / subgroups */}
        {isRoot && isExpanded && (
          <div className="space-y-0.5">
            {children.map(child => (
              <GroupItem key={child.id} group={child} depth={1} />
            ))}
            {newSubgroupParentId === group.id && (
              <form onSubmit={(e) => { e.preventDefault(); handleAddGroup(group.id); }} className="py-1 flex items-center gap-1.5" style={{ paddingLeft: `${28 + 16}px`, paddingRight: 12 }}>
                <input
                  autoFocus
                  enterKeyHint="done"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onBlur={() => { setTimeout(() => { if (!newGroupName.trim()) setNewSubgroupParentId(null); }, 150); }}
                  placeholder="Подпроект..."
                  className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                />
                <button type="submit" disabled={!newGroupName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  const renderTagItem = (t: typeof tags[number]) => (
    <div
      key={t.id}
      className={cn("group", draggingTagId === t.id && "opacity-40")}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("tag-id", t.id); setDraggingTagId(t.id); }}
      onDragEnd={() => { setDraggingTagId(null); setDragOverCategoryId(null); }}
    >
      <div className="flex items-center">
        <GripVertical className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 cursor-grab text-sidebar-fg/50 mr-0.5" />
        <button
          draggable={false}
          onClick={() => onToggleTag(t.id)}
          className={cn(
            "flex items-center gap-3 flex-1 px-2 py-2 rounded-lg text-sm transition-colors",
            activeTagFilters.includes(t.id)
              ? "bg-sidebar-active text-sidebar-fg"
              : "text-sidebar-fg/80 hover:bg-sidebar-hover"
          )}
        >
          <Tag className="h-3.5 w-3.5" style={{ color: t.color || undefined }} />
        {editingTagId === t.id ? (
          <input
            autoFocus
            enterKeyHint="done"
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
          {t.user_id === user?.id && (
            <>
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
                    <Input value={tagShareEmail} onChange={(e) => setTagShareEmail(e.target.value)} placeholder="Email..." className="h-7 text-xs" />
                    <button type="submit" disabled={!tagShareEmail.trim()} className="text-xs text-primary hover:text-primary/80 whitespace-nowrap disabled:opacity-30">Дать</button>
                  </form>
                </PopoverContent>
              </Popover>
              <ConfirmDelete title="Удалить тэг?" description="Тэг будет снят со всех задач." onConfirm={() => deleteTag.mutate(t.id)}>
                <span onClick={(e) => e.stopPropagation()} className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </ConfirmDelete>
            </>
          )}
        </div>
        </button>
      </div>
    </div>
  );

  const renderNewTagForm = (categoryId: string | null) => (
    <form onSubmit={(e) => { e.preventDefault(); handleAddTag(categoryId); setEditingTagId(null); }} className="px-3 py-1 flex items-center gap-1.5">
      <input
        autoFocus
        enterKeyHint="done"
        value={newTagName}
        onChange={(e) => setNewTagName(e.target.value)}
        onBlur={() => { setTimeout(() => { if (!newTagName.trim()) { setEditingTagId(null); setNewTagCategoryId(null); } }, 150); }}
        placeholder="Название тэга..."
        className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
      />
      <button type="submit" disabled={!newTagName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  );

  return (
    <aside className="w-72 bg-sidebar-bg text-sidebar-fg flex flex-col h-full min-h-0 shrink-0 border-r border-sidebar-fg/5 max-md:border-r-0">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-sm font-black text-primary-foreground leading-none">✓</span>
          </div>
          <span className="text-lg font-bold tracking-tight">Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="ios-sidebar-scroll flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 space-y-0.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => { onViewChange(item.id); onGroupChange(null); onClearTags(); }}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
              activeView === item.id && !activeGroupId
                ? "bg-sidebar-fg/15 text-sidebar-fg shadow-sm"
                : "text-sidebar-fg/70 hover:bg-sidebar-fg/10 hover:text-sidebar-fg"
            )}
          >
            <item.icon className="h-4 w-4" />
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
            <span className="ml-auto flex items-center gap-1">
              <SmartImportDialog
                trigger={
                  <span
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-sidebar-fg"
                    title="Умный импорт из Excel"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </span>
                }
              />
              <span
                onClick={(e) => { e.stopPropagation(); setShowNewFolder(true); }}
                className="hover:text-sidebar-fg"
                title="Новая папка"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); setShowNewGroup(true); setNewSubgroupParentId(null); }}
                className="hover:text-sidebar-fg"
                title="Новый проект"
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </span>
          </button>
          {showGroups && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleProjectDragStart}
              onDragOver={handleProjectDragOver}
              onDragEnd={handleProjectDragEnd}
            >
              <SortableContext items={rootGroups.map(g => g.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0.5 mt-1">
                  {/* New folder form */}
                  {showNewFolder && (
                    <form onSubmit={(e) => { e.preventDefault(); if (newFolderName.trim()) { addProjectFolder.mutate({ name: newFolderName.trim() }); setNewFolderName(""); setShowNewFolder(false); } }} className="px-3 py-1 flex items-center gap-1.5">
                      <FolderOpen className="h-3.5 w-3.5 text-sidebar-fg/50 shrink-0" />
                      <input
                        autoFocus
                        enterKeyHint="done"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onBlur={() => { setTimeout(() => { if (!newFolderName.trim()) setShowNewFolder(false); }, 150); }}
                        placeholder="Название папки..."
                        className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                      />
                      <button type="submit" disabled={!newFolderName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}

                  {/* NPD virtual folder */}
                  {npdRootGroups.length > 0 && (
                    <div>
                      <div
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-sidebar-fg/70 hover:bg-sidebar-hover cursor-pointer transition-colors"
                        onClick={() => toggleFolderExpand("__npd__")}
                      >
                        <span className="shrink-0">
                          {expandedFolders.has("__npd__") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </span>
                        <span className="shrink-0">🧪</span>
                        <span className="truncate flex-1 text-left font-medium">NPD</span>
                        <span className="text-[10px] text-sidebar-fg/40">{npdRootGroups.length}</span>
                      </div>
                      {expandedFolders.has("__npd__") && (
                        <div className="space-y-0.5">
                          {npdRootGroups.map(g => (
                            <GroupItem key={g.id} group={g} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Folders with projects */}
                  {folders.map(folder => {
                    const folderProjects = getGroupsInFolder(folder.id);
                    const isFolderExpanded = expandedFolders.has(folder.id);
                    const isFolderDragOver = dragOverFolderId === folder.id;
                    return (
                      <DroppableFolder key={folder.id} id={folder.id} isOver={isFolderDragOver}>
                        <div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-sidebar-fg/70 hover:bg-sidebar-hover cursor-pointer transition-colors">
                          <span onClick={() => toggleFolderExpand(folder.id)} className="shrink-0">
                            {isFolderExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <span onClick={(e) => e.stopPropagation()} className="shrink-0 cursor-pointer hover:opacity-80">
                                <FolderOpen className="h-3.5 w-3.5" style={{ color: folder.color || "#6366f1" }} />
                              </span>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-3" side="right" onClick={(e) => e.stopPropagation()}>
                              <p className="text-xs font-medium text-muted-foreground mb-2">Цвет папки</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {COLOR_PRESETS.map(p => (
                                  <button
                                    key={p.hue}
                                    onClick={() => updateFolderColor.mutate({ id: folder.id, color: `hsl(${p.hue}, 70%, 50%)` })}
                                    className={cn("h-5 w-5 rounded-full transition-transform hover:scale-110 border border-border/50")}
                                    style={{ backgroundColor: `hsl(${p.hue}, 70%, 50%)` }}
                                    title={p.label}
                                  />
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          {editingFolderId === folder.id ? (
                            <input
                              autoFocus
                              enterKeyHint="done"
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onBlur={() => handleSaveFolderName(folder.id)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSaveFolderName(folder.id); if (e.key === "Escape") setEditingFolderId(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
                            />
                          ) : (
                            <span
                              className="truncate flex-1 text-left"
                              onClick={() => toggleFolderExpand(folder.id)}
                              onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setEditingFolderName(folder.name); }}
                            >
                              {folder.name}
                            </span>
                          )}
                          <span className="text-[10px] text-sidebar-fg/40">{folderProjects.length}</span>
                          <ConfirmDelete title="Удалить папку?" description="Проекты останутся, но потеряют привязку к папке." onConfirm={() => deleteProjectFolder.mutate(folder.id)}>
                            <span onClick={(e) => e.stopPropagation()} className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer">
                              <Trash2 className="h-3 w-3" />
                            </span>
                          </ConfirmDelete>
                        </div>
                        {isFolderExpanded && (
                          <div className="space-y-0.5">
                            {folderProjects.map(g => (
                              <GroupItem key={g.id} group={g} />
                            ))}
                          </div>
                        )}
                      </DroppableFolder>
                    );
                  })}

                  {/* Ungrouped projects */}
                  <DroppableUngrouped isOver={dragOverFolderId === "__ungrouped__"}>
                    {ungroupedProjects.map((g) => (
                      <GroupItem key={g.id} group={g} />
                    ))}
                  </DroppableUngrouped>

                  {showNewGroup && !newSubgroupParentId && (
                    <form onSubmit={(e) => { e.preventDefault(); handleAddGroup(); }} className="px-3 py-1 flex items-center gap-1.5">
                      <input
                        autoFocus
                        enterKeyHint="done"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onBlur={() => { setTimeout(() => { if (!newGroupName.trim()) setShowNewGroup(false); }, 150); }}
                        placeholder="Название проекта..."
                        className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                      />
                      <button type="submit" disabled={!newGroupName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              </SortableContext>
            </DndContext>
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
            <div className="ml-auto flex items-center gap-1">
              <span
                onClick={(e) => { e.stopPropagation(); setShowNewCategory(true); }}
                className="hover:text-sidebar-fg"
                title="Новая категория"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); setEditingTagId("__new__"); setNewTagCategoryId(null); setNewTagName(""); }}
                className="hover:text-sidebar-fg"
                title="Новый тэг"
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            </div>
          </button>
          {showTags && (
            <div className="space-y-1 mt-1">
              {/* New category form */}
              {showNewCategory && !newSubcategoryParentId && (
                <form onSubmit={(e) => { e.preventDefault(); handleAddCategory(); }} className="px-3 py-1 flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-sidebar-fg/50 shrink-0" />
                  <input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onBlur={() => { setTimeout(() => { if (!newCategoryName.trim()) { setShowNewCategory(false); setNewSubcategoryParentId(null); } }, 150); }}
                    placeholder="Категория..."
                    className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                  />
                  <button type="submit" disabled={!newCategoryName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}

              {/* Root categories (parent_id is null) */}
              {tagCategories.filter(c => !c.parent_id && c.user_id === user?.id).map((cat) => {
                const subcategories = tagCategories.filter(c => c.parent_id === cat.id && c.user_id === user?.id);
                const matchingCatIds = categoryIdMapping.get(cat.id) || new Set([cat.id]);
                const catTags = tags.filter(t => matchingCatIds.has((t as any).category_id));
                const isExpanded = expandedCategories.has(cat.id);
                return (
                  <div key={cat.id}>
                    <div
                      className={cn("group flex items-center", dragOverCategoryId === cat.id && "bg-primary/10 rounded-lg")}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId(cat.id); }}
                      onDragLeave={() => setDragOverCategoryId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const tagId = e.dataTransfer.getData("tag-id");
                        if (tagId) { updateTagCategory.mutate({ tag_id: tagId, category_id: cat.id }); }
                        setDragOverCategoryId(null); setDraggingTagId(null);
                      }}
                    >
                      <button
                        onClick={() => toggleCategory(cat.id)}
                        className="flex items-center gap-2 flex-1 px-3 py-1.5 text-xs font-medium text-sidebar-fg/70 hover:text-sidebar-fg/90 transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {editingCategoryId === cat.id ? (
                          <input
                            autoFocus
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onBlur={() => handleSaveCategoryName(cat.id)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveCategoryName(cat.id); if (e.key === "Escape") setEditingCategoryId(null); }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-xs text-sidebar-fg outline-none min-w-0"
                          />
                        ) : (
                          <span
                            className="truncate flex-1 text-left"
                            onDoubleClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                          >
                            {cat.name}
                          </span>
                        )}
                        <span className="text-sidebar-fg/40 text-xs">{catTags.length + subcategories.reduce((acc, sc) => acc + tags.filter(t => { const ids = categoryIdMapping.get(sc.id) || new Set([sc.id]); return ids.has((t as any).category_id); }).length, 0)}</span>
                      </button>
                      <div className="flex items-center gap-0.5 pr-2 shrink-0">
                        <span
                          onClick={(e) => { e.stopPropagation(); setShowNewCategory(true); setNewSubcategoryParentId(cat.id); setNewCategoryName(""); }}
                          className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-sidebar-fg/60"
                          title="Добавить подпапку"
                        >
                          <FolderPlus className="h-3 w-3" />
                        </span>
                        <span
                          onClick={(e) => { e.stopPropagation(); setEditingTagId("__new__"); setNewTagCategoryId(cat.id); setNewTagName(""); }}
                          className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-sidebar-fg/60"
                          title="Добавить тэг в категорию"
                        >
                          <Plus className="h-3 w-3" />
                        </span>
                        {cat.user_id === user?.id && (
                          <ConfirmDelete title="Удалить категорию?" description="Подкатегории и тэги останутся, но потеряют привязку." onConfirm={() => deleteTagCategory.mutate(cat.id)}>
                            <span onClick={(e) => e.stopPropagation()} className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-sidebar-fg/60">
                              <Trash2 className="h-3 w-3" />
                            </span>
                          </ConfirmDelete>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="space-y-0.5 ml-2">
                        {/* New subcategory form */}
                        {showNewCategory && newSubcategoryParentId === cat.id && (
                          <form onSubmit={(e) => { e.preventDefault(); handleAddCategory(cat.id); }} className="px-3 py-1 flex items-center gap-1.5">
                            <FolderOpen className="h-3 w-3 text-sidebar-fg/50 shrink-0" />
                            <input
                              autoFocus
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              onBlur={() => { setTimeout(() => { if (!newCategoryName.trim()) { setShowNewCategory(false); setNewSubcategoryParentId(null); } }, 150); }}
                              placeholder="Подпапка..."
                              className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1 text-xs text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
                            />
                            <button type="submit" disabled={!newCategoryName.trim()} className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                              <Send className="h-3 w-3" />
                            </button>
                          </form>
                        )}

                        {/* Subcategories */}
                        {subcategories.map((subcat) => {
                          const matchingSubIds = categoryIdMapping.get(subcat.id) || new Set([subcat.id]);
                          const subTags = tags.filter(t => matchingSubIds.has((t as any).category_id));
                          const isSubExpanded = expandedCategories.has(subcat.id);
                          return (
                            <div key={subcat.id}>
                              <div
                                className={cn("group flex items-center", dragOverCategoryId === subcat.id && "bg-primary/10 rounded-lg")}
                                onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId(subcat.id); }}
                                onDragLeave={() => setDragOverCategoryId(null)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  const tagId = e.dataTransfer.getData("tag-id");
                                  if (tagId) { updateTagCategory.mutate({ tag_id: tagId, category_id: subcat.id }); }
                                  setDragOverCategoryId(null); setDraggingTagId(null);
                                }}
                              >
                                <button
                                  onClick={() => toggleCategory(subcat.id)}
                                  className="flex items-center gap-1.5 flex-1 px-2 py-1 text-xs text-sidebar-fg/60 hover:text-sidebar-fg/80 transition-colors"
                                >
                                  {isSubExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                                  {editingCategoryId === subcat.id ? (
                                    <input
                                      autoFocus
                                      value={editingCategoryName}
                                      onChange={(e) => setEditingCategoryName(e.target.value)}
                                      onBlur={() => handleSaveCategoryName(subcat.id)}
                                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveCategoryName(subcat.id); if (e.key === "Escape") setEditingCategoryId(null); }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 bg-sidebar-hover/50 rounded px-1 py-0.5 text-xs text-sidebar-fg outline-none min-w-0"
                                    />
                                  ) : (
                                    <span
                                      className="truncate flex-1 text-left"
                                      onDoubleClick={(e) => { e.stopPropagation(); setEditingCategoryId(subcat.id); setEditingCategoryName(subcat.name); }}
                                    >
                                      {subcat.name}
                                    </span>
                                  )}
                                  <span className="text-sidebar-fg/40 text-[10px]">{subTags.length}</span>
                                </button>
                                <div className="flex items-center gap-0.5 pr-2 shrink-0">
                                  <span
                                    onClick={(e) => { e.stopPropagation(); setEditingTagId("__new__"); setNewTagCategoryId(subcat.id); setNewTagName(""); }}
                                    className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-sidebar-fg/60"
                                    title="Добавить тэг"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </span>
                                  {subcat.user_id === user?.id && (
                                    <ConfirmDelete title="Удалить подкатегорию?" description="Тэги останутся, но потеряют привязку." onConfirm={() => deleteTagCategory.mutate(subcat.id)}>
                                      <span onClick={(e) => e.stopPropagation()} className="p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer text-sidebar-fg/60">
                                        <Trash2 className="h-2.5 w-2.5" />
                                      </span>
                                    </ConfirmDelete>
                                  )}
                                </div>
                              </div>
                              {isSubExpanded && (
                                <div className="space-y-0.5 ml-3">
                                  {subTags.map((t) => renderTagItem(t))}
                                  {editingTagId === "__new__" && newTagCategoryId === subcat.id && renderNewTagForm(subcat.id)}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Tags directly in root category */}
                        {catTags.map((t) => renderTagItem(t))}
                        {editingTagId === "__new__" && newTagCategoryId === cat.id && renderNewTagForm(cat.id)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Uncategorized tags */}
              {(() => {
                const uncategorized = tags.filter(t => !(t as any).category_id || !allMappedCategoryIds.has((t as any).category_id));
                if (uncategorized.length === 0 && editingTagId !== "__new__") return null;
                const isExpanded = expandedCategories.has("__uncategorized__");
                return (
                  <div>
                    {tagCategories.length > 0 && (
                      <button
                        onClick={() => toggleCategory("__uncategorized__")}
                        className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-sidebar-fg/70 hover:text-sidebar-fg/90 transition-colors", dragOverCategoryId === "__uncategorized__" && "bg-primary/10 rounded-lg")}
                        onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId("__uncategorized__"); }}
                        onDragLeave={() => setDragOverCategoryId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          const tagId = e.dataTransfer.getData("tag-id");
                          if (tagId) { updateTagCategory.mutate({ tag_id: tagId, category_id: null }); }
                          setDragOverCategoryId(null); setDraggingTagId(null);
                        }}
                      >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="truncate flex-1 text-left">Без категории</span>
                        <span className="text-sidebar-fg/40 text-xs">{uncategorized.length}</span>
                      </button>
                    )}
                    {(isExpanded || tagCategories.length === 0) && (
                      <div className={cn("space-y-0.5", tagCategories.length > 0 && "ml-2")}>
                        {uncategorized.map((t) => renderTagItem(t))}
                        {editingTagId === "__new__" && !newTagCategoryId && renderNewTagForm(null)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-fg/8">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-fg/5 transition-colors">
          <div className="h-8 w-8 rounded-full bg-sidebar-fg/15 flex items-center justify-center text-sm font-semibold">
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm truncate flex-1 text-sidebar-fg/80">{user?.email}</span>
          <Link to="/settings" className="p-1.5 rounded-md text-sidebar-fg/40 hover:text-sidebar-fg hover:bg-sidebar-fg/10 transition-all">
            <Settings className="h-4 w-4" />
          </Link>
          <button onClick={signOut} className="p-1.5 rounded-md text-sidebar-fg/40 hover:text-sidebar-fg hover:bg-sidebar-fg/10 transition-all">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
