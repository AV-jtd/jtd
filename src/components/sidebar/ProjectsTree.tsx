import { Suspense, lazy, useCallback, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  FolderPlus,
  Plus,
  Send,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

import { TaskGroup, useProjectFolderItems, useProjectFolders, useTaskGroups, useTaskMutations } from "@/hooks/useTasks";
import { DroppableFolder, DroppableUngrouped } from "@/components/sidebar/SidebarDroppables";
import GroupItem from "@/components/sidebar/GroupItem";
import FolderRow from "@/components/sidebar/FolderRow";

const SmartImportDialog = lazy(() => import("@/components/SmartImportDialog"));

/**
 * The "Projects" branch of the sidebar.
 *
 * Owns the local UI state for the projects list:
 *  - which root group ids are expanded,
 *  - which folder ids are expanded (incl. the virtual "__npd__" folder),
 *  - whether the archive section is visible,
 *  - inline create-folder / create-project forms,
 *  - DnD-kit context for moving projects between folders.
 *
 * It deliberately doesn't own selection — that's app-level state passed in
 * via `activeGroupId` + `onGroupChange` so other modules can drive it.
 */
interface ProjectsTreeProps {
  activeGroupId: string | null;
  onGroupChange: (id: string | null) => void;
  onViewChange: (view: string) => void;
  onClearTags: () => void;
  onToggleProjectDetail: () => void;
}

export default function ProjectsTree({
  activeGroupId, onGroupChange, onViewChange, onClearTags, onToggleProjectDetail,
}: ProjectsTreeProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: folders = [] } = useProjectFolders();
  const { data: folderItems = [] } = useProjectFolderItems();
  const { addGroup, addProjectFolder, moveProjectToFolder, reorderGroups } = useTaskMutations();

  const [showGroups, setShowGroups] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // ---------- Derived data (memoised so GroupItem.memo bites) ----------

  const childrenByParent = useMemo(() => {
    const map = new Map<string, TaskGroup[]>();
    for (const g of groups) {
      if (!g.parent_id) continue;
      const arr = map.get(g.parent_id);
      if (arr) arr.push(g); else map.set(g.parent_id, [g]);
    }
    return map;
  }, [groups]);

  const groupFolderMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const fi of folderItems) map.set(fi.group_id, fi.folder_id);
    return map;
  }, [folderItems]);

  const { rootGroups, archivedGroups, npdRootGroups, nonNpdRootGroups } = useMemo(() => {
    const root: TaskGroup[] = [];
    const archived: TaskGroup[] = [];
    for (const g of groups) {
      if (g.parent_id) continue;
      if ((g as { closed_at?: string | null }).closed_at) archived.push(g); else root.push(g);
    }
    const npd: TaskGroup[] = [];
    const nonNpd: TaskGroup[] = [];
    for (const g of root) {
      const t = (g as { project_type?: string }).project_type;
      if (t === "npd") npd.push(g);
      else if (t !== "protocol") nonNpd.push(g);
    }
    return { rootGroups: root, archivedGroups: archived, npdRootGroups: npd, nonNpdRootGroups: nonNpd };
  }, [groups]);

  const groupsInFolder = useCallback(
    (folderId: string) => nonNpdRootGroups.filter((g) => groupFolderMap.get(g.id) === folderId),
    [nonNpdRootGroups, groupFolderMap],
  );

  const ungroupedProjects = useMemo(
    () => nonNpdRootGroups.filter((g) => !groupFolderMap.has(g.id)),
    [nonNpdRootGroups, groupFolderMap],
  );

  // ---------- Stable callbacks for memoised GroupItem ----------

  const handleSelect = useCallback((groupId: string) => {
    onGroupChange(groupId);
    onViewChange("group");
    onClearTags();
  }, [onGroupChange, onViewChange, onClearTags]);

  const handleToggleExpand = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }, []);

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  }, []);

  const handleOpenDetail = useCallback((groupId: string) => {
    onGroupChange(groupId);
    onViewChange("group");
    onClearTags();
    onToggleProjectDetail();
  }, [onGroupChange, onViewChange, onClearTags, onToggleProjectDetail]);

  const isChildActive = useCallback((id: string) => activeGroupId === id, [activeGroupId]);
  const isChildExpanded = useCallback((id: string) => expandedGroups.has(id), [expandedGroups]);
  const getChildGroups = useCallback((id: string) => childrenByParent.get(id) ?? [], [childrenByParent]);
  const getGroupFolderId = useCallback((id: string) => groupFolderMap.get(id) ?? null, [groupFolderMap]);

  // ---------- DnD ----------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = useCallback((_e: DragStartEvent) => {
    setDragOverFolderId(null);
  }, []);

  const onDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (!overId) { setDragOverFolderId(null); return; }
    if (overId.startsWith("folder:")) setDragOverFolderId(overId.replace("folder:", ""));
    else if (overId === "ungrouped-drop") setDragOverFolderId("__ungrouped__");
    else setDragOverFolderId(null);
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDragOverFolderId(null);
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith("folder:")) {
      const folderId = overId.replace("folder:", "");
      if (groupFolderMap.get(activeId) !== folderId) {
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: folderId });
      }
      return;
    }
    if (overId === "ungrouped-drop") {
      if (groupFolderMap.has(activeId)) {
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: null });
      }
      return;
    }

    const overProject = rootGroups.find((g) => g.id === overId);
    if (!overProject) return;
    const activeFolder = groupFolderMap.get(activeId) ?? null;
    const overFolder = groupFolderMap.get(overId) ?? null;

    if (activeFolder !== overFolder) {
      moveProjectToFolder.mutate({ group_id: activeId, folder_id: overFolder });
    } else if (!activeFolder) {
      const oldIndex = ungroupedProjects.findIndex((g) => g.id === activeId);
      const newIndex = ungroupedProjects.findIndex((g) => g.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(ungroupedProjects, oldIndex, newIndex);
        reorderGroups.mutate(reordered.map((g, i) => ({ id: g.id, position: i })));
      }
    }
  }, [groupFolderMap, moveProjectToFolder, rootGroups, ungroupedProjects, reorderGroups]);

  const handleAddFolder = (e: FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      addProjectFolder.mutate({ name: newFolderName.trim() });
      setNewFolderName("");
      setShowNewFolder(false);
    }
  };

  const handleAddGroup = (e: FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      addGroup.mutate({ name: newGroupName.trim(), parent_id: null });
      setNewGroupName("");
      setShowNewGroup(false);
    }
  };

  const renderGroup = (g: TaskGroup) => (
    <GroupItem
      key={g.id}
      group={g}
      depth={0}
      isActive={activeGroupId === g.id}
      isExpanded={expandedGroups.has(g.id)}
      hasChildren={(childrenByParent.get(g.id)?.length ?? 0) > 0}
      childGroups={childrenByParent.get(g.id) ?? []}
      groupFolderId={groupFolderMap.get(g.id) ?? null}
      onSelect={handleSelect}
      onToggleExpand={handleToggleExpand}
      onOpenDetail={handleOpenDetail}
      isChildActive={isChildActive}
      isChildExpanded={isChildExpanded}
      getChildGroups={getChildGroups}
      getGroupFolderId={getGroupFolderId}
    />
  );

  return (
    <div className="pt-4">
      <button
        onClick={() => setShowGroups((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs uppercase tracking-wider text-sidebar-fg/60 hover:text-sidebar-fg/80"
      >
        {showGroups ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Проекты
        <span className="ml-auto flex items-center gap-1">
          <Suspense fallback={<span className="text-sidebar-fg/40"><Download className="h-3.5 w-3.5" /></span>}>
            <SmartImportDialog
              trigger={
                <span onClick={(e) => e.stopPropagation()} className="hover:text-sidebar-fg" title="Умный импорт из Excel">
                  <Download className="h-3.5 w-3.5" />
                </span>
              }
            />
          </Suspense>
          <span onClick={(e) => { e.stopPropagation(); setShowNewFolder(true); }} className="hover:text-sidebar-fg" title="Новая папка">
            <FolderPlus className="h-3.5 w-3.5" />
          </span>
          <span onClick={(e) => { e.stopPropagation(); setShowNewGroup(true); }} className="hover:text-sidebar-fg" title="Новый проект">
            <Plus className="h-3.5 w-3.5" />
          </span>
        </span>
      </button>

      {showGroups && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <SortableContext items={rootGroups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 mt-1">
              {showNewFolder && (
                <form onSubmit={handleAddFolder} className="px-3 py-1 flex items-center gap-1.5">
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

              {/* Virtual NPD folder */}
              {npdRootGroups.length > 0 && (
                <div>
                  <div
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-sidebar-fg/70 hover:bg-sidebar-hover cursor-pointer transition-colors"
                    onClick={() => handleToggleFolder("__npd__")}
                  >
                    <span className="shrink-0">
                      {expandedFolders.has("__npd__") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <span className="shrink-0">🧪</span>
                    <span className="truncate flex-1 text-left font-medium">NPD</span>
                    <span className="text-[10px] text-sidebar-fg/40">{npdRootGroups.length}</span>
                  </div>
                  {expandedFolders.has("__npd__") && (
                    <div className="space-y-0.5">{npdRootGroups.map(renderGroup)}</div>
                  )}
                </div>
              )}

              {/* Folders with projects */}
              {folders.map((folder) => {
                const folderProjects = groupsInFolder(folder.id);
                const isExpanded = expandedFolders.has(folder.id);
                return (
                  <DroppableFolder key={folder.id} id={folder.id} isOver={dragOverFolderId === folder.id}>
                    <FolderRow
                      id={folder.id}
                      name={folder.name}
                      color={folder.color ?? null}
                      count={folderProjects.length}
                      expanded={isExpanded}
                      onToggle={() => handleToggleFolder(folder.id)}
                    />
                    {isExpanded && (
                      <div className="space-y-0.5">{folderProjects.map(renderGroup)}</div>
                    )}
                  </DroppableFolder>
                );
              })}

              {/* Ungrouped */}
              <DroppableUngrouped isOver={dragOverFolderId === "__ungrouped__"}>
                {ungroupedProjects.map(renderGroup)}
              </DroppableUngrouped>

              {/* Archived */}
              {archivedGroups.length > 0 && (
                <div>
                  <div
                    onClick={() => setShowArchived((v) => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-sidebar-fg/40 hover:text-sidebar-fg/60 cursor-pointer transition-colors"
                  >
                    <span className="shrink-0">
                      {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <Archive className="h-3.5 w-3.5" />
                    <span className="truncate flex-1 text-left font-medium">Архив</span>
                    <span className="text-[10px] text-sidebar-fg/30">{archivedGroups.length}</span>
                  </div>
                  {showArchived && (
                    <div className="space-y-0.5 opacity-50">{archivedGroups.map(renderGroup)}</div>
                  )}
                </div>
              )}

              {showNewGroup && (
                <form onSubmit={handleAddGroup} className="px-3 py-1 flex items-center gap-1.5">
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
  );
}