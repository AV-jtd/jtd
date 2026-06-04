import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { TaskGroup, useProjectFolderItems, useProjectFolders, useTaskGroups, useTaskMutations } from "@/hooks/useTasks";
import { DroppableFolder, DroppableUngrouped } from "@/components/sidebar/SidebarDroppables";
import GroupItem from "@/components/sidebar/GroupItem";
import FolderRow from "@/components/sidebar/FolderRow";
import VirtualGroupList, { type VirtualGroupListHandle } from "@/components/sidebar/VirtualGroupList";

const SmartImportDialog = lazyWithRetry(() => import("@/components/SmartImportDialog"));

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

  // ---------- Refs for autoscroll into the virtualised lists ----------
  // Each section that renders a VirtualGroupList registers its imperative
  // handle here so we can find which section owns the active project and
  // ask it to scroll the row into view.
  const npdListRef = useRef<VirtualGroupListHandle | null>(null);
  const ungroupedListRef = useRef<VirtualGroupListHandle | null>(null);
  const archivedListRef = useRef<VirtualGroupListHandle | null>(null);
  const folderListRefs = useRef<Map<string, VirtualGroupListHandle | null>>(new Map());
  // Per-retailer STM list refs, keyed by retailer name (matches __stm__:<retailer>).
  // Entries are removed via the ref-callback cleanup when a VirtualGroupList unmounts,
  // and a sync effect below prunes any keys that no longer correspond to a retailer
  // present in the data (covers retailer renames and HMR remounts).
  const stmRetailerListRefs = useRef<Map<string, VirtualGroupListHandle | null>>(new Map());
  // FolderRow header DOM nodes — used to scroll the header into view when
  // a folder gets expanded so the user can immediately see what's inside.
  const folderRowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  // Tracks which folders were already expanded between renders, so we only
  // scroll on the *transition* closed→open (not on every re-render).
  const prevExpandedFoldersRef = useRef<Set<string>>(new Set());

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

  const { rootGroups, archivedGroups, npdRootGroups, stmRootGroups, nonNpdRootGroups } = useMemo(() => {
    const root: TaskGroup[] = [];
    const archived: TaskGroup[] = [];
    for (const g of groups) {
      if (g.parent_id) continue;
      if ((g as { closed_at?: string | null }).closed_at) archived.push(g); else root.push(g);
    }
    const npd: TaskGroup[] = [];
    const stm: TaskGroup[] = [];
    const nonNpd: TaskGroup[] = [];
    for (const g of root) {
      const t = (g as { project_type?: string }).project_type;
      const sub = (g as { project_subtype?: string }).project_subtype;
      if (t === "npd" && sub === "npd_stm") stm.push(g);
      else if (t === "npd") npd.push(g);
      else if (t !== "protocol" && t !== "crm_client") nonNpd.push(g);
    }
    return { rootGroups: root, archivedGroups: archived, npdRootGroups: npd, stmRootGroups: stm, nonNpdRootGroups: nonNpd };
  }, [groups]);

  /**
   * STM SKU projects grouped by retailer (stm_meta.retailer).
   * Projects without a retailer fall into a "Без клиента" bucket so nothing
   * silently disappears.
   */
  const stmByRetailer = useMemo(() => {
    const map = new Map<string, TaskGroup[]>();
    for (const g of stmRootGroups) {
      const meta = ((g as { stm_meta?: { retailer?: string } }).stm_meta) ?? {};
      const retailer = (meta.retailer ?? "").trim() || "Без клиента";
      const arr = map.get(retailer);
      if (arr) arr.push(g); else map.set(retailer, [g]);
    }
    // Stable alphabetical order, "Без клиента" last.
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "Без клиента") return 1;
      if (b === "Без клиента") return -1;
      return a.localeCompare(b, "ru");
    });
  }, [stmRootGroups]);

  // Prune stale entries from the per-retailer ref map whenever the set of
  // retailers changes (e.g. a SKU was renamed to a different retailer, the
  // last SKU for a retailer was deleted, or HMR replaced child components
  // without unmounting the tree). Without this the Map would grow unbounded
  // and `stmRetailerListRefs.current.get(retailer)` could hand out a handle
  // for a list that no longer exists.
  useEffect(() => {
    const valid = new Set(stmByRetailer.map(([retailer]) => retailer));
    for (const key of stmRetailerListRefs.current.keys()) {
      if (!valid.has(key)) stmRetailerListRefs.current.delete(key);
    }
  }, [stmByRetailer]);

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

  // ---------- Autoscroll effects ----------

  /**
   * Coalesced autoscroll queue.
   *
   * Two independent triggers can request a scroll at nearly the same time:
   *   - a folder just expanded → scroll its header into view
   *   - `activeGroupId` changed → scroll the active row to centre
   *
   * Without coordination, fast navigation (deep links, keyboard arrow
   * through projects, multiple folders toggled in a burst) fires several
   * `scrollIntoView({behavior:"smooth"})` / `virtualizer.scrollToIndex`
   * calls per frame. Smooth scroll restarts on every call, so the user
   * sees a jittery half-finished animation that lands on whichever call
   * happened to be last — and intermediate calls waste layout work.
   *
   * We keep a per-slot "latest intent" and a single rAF handle. New
   * requests overwrite the intent and reuse the pending frame, so at most
   * one scroll per slot per frame ever runs. Two slots (folder vs active)
   * stay independent because they target different rows; if both fire in
   * the same frame, the active-row scroll runs after the folder header
   * one (queued via the second rAF) so it wins visually — which matches
   * user expectation: "show me where I just navigated to".
   */
  type ScrollIntent =
    | { kind: "node"; node: HTMLElement; align: ScrollLogicalPosition }
    | { kind: "list"; list: VirtualGroupListHandle; id: string; align: "start" | "center" | "end" | "auto" };

  const scrollSlotsRef = useRef<{
    folder: ScrollIntent | null;
    active: ScrollIntent | null;
    rafId: number | null;
  }>({ folder: null, active: null, rafId: null });

  const flushScrollQueue = useCallback(() => {
    const slots = scrollSlotsRef.current;
    slots.rafId = null;
    const folder = slots.folder;
    const active = slots.active;
    slots.folder = null;
    slots.active = null;
    // Folder header first — it's just framing context for the active row.
    if (folder) {
      if (folder.kind === "node") {
        folder.node.scrollIntoView({ block: folder.align, behavior: "smooth" });
      }
    }
    // Active row last so it wins the final resting position.
    if (active) {
      if (active.kind === "list") active.list.scrollToId(active.id, { align: active.align });
      else if (active.kind === "node") active.node.scrollIntoView({ block: active.align, behavior: "smooth" });
    }
  }, []);

  const requestScroll = useCallback(
    (slot: "folder" | "active", intent: ScrollIntent) => {
      const slots = scrollSlotsRef.current;
      // Latest intent wins — overwrites any pending request for this slot.
      slots[slot] = intent;
      if (slots.rafId !== null) return;
      // Two rAFs: first lets React commit pending state (folder expand,
      // virtualised list mount); second lets the virtualizer measure
      // freshly mounted rows before we scroll to them.
      slots.rafId = requestAnimationFrame(() => {
        slots.rafId = requestAnimationFrame(flushScrollQueue);
      });
    },
    [flushScrollQueue],
  );

  // Cancel any pending scroll on unmount to avoid touching a dead DOM.
  useEffect(() => {
    return () => {
      const slots = scrollSlotsRef.current;
      if (slots.rafId !== null) {
        cancelAnimationFrame(slots.rafId);
        slots.rafId = null;
      }
      slots.folder = null;
      slots.active = null;
    };
  }, []);

  /**
   * When a folder transitions from collapsed→expanded, scroll its header row
   * to the top of the visible area so the user immediately sees what just
   * opened. We diff against the previous Set so toggling other folders or
   * unrelated re-renders don't trigger spurious scrolls.
   */
  useEffect(() => {
    const prev = prevExpandedFoldersRef.current;
    const justOpened: string[] = [];
    for (const id of expandedFolders) if (!prev.has(id)) justOpened.push(id);
    prevExpandedFoldersRef.current = new Set(expandedFolders);
    if (justOpened.length === 0) return;
    // Only scroll the most recent toggle — scrolling to multiple at once
    // would just leave the last one visible anyway.
    const target = justOpened[justOpened.length - 1];
    const node = folderRowRefs.current.get(target);
    if (node) requestScroll("folder", { kind: "node", node, align: "nearest" });
  }, [expandedFolders, requestScroll]);

  /**
   * When `activeGroupId` changes (e.g. via deep link, navigation, or a click
   * elsewhere in the app), find which list owns the project, auto-expand
   * its parent folder if needed, then ask the virtualised list to scroll
   * the row to the centre of the viewport.
   */
  useEffect(() => {
    if (!activeGroupId || !showGroups) return;

    // 1) Determine which list owns this id and whether a parent folder
    //    needs to expand first.
    let needsFolderExpand: string | null = null;
    let listRef: VirtualGroupListHandle | null = null;

    if (npdRootGroups.some((g) => g.id === activeGroupId)) {
      if (!expandedFolders.has("__npd__")) needsFolderExpand = "__npd__";
      else listRef = npdListRef.current;
    } else if (stmRootGroups.some((g) => g.id === activeGroupId)) {
      // Open the STM root section AND the retailer subgroup containing this SKU.
      if (!expandedFolders.has("__stm__")) {
        needsFolderExpand = "__stm__";
      } else {
        const meta = ((stmRootGroups.find((g) => g.id === activeGroupId) as { stm_meta?: { retailer?: string } } | undefined)?.stm_meta) ?? {};
        const retailer = (meta.retailer ?? "").trim() || "Без клиента";
        const retailerKey = `__stm__:${retailer}`;
        if (!expandedFolders.has(retailerKey)) needsFolderExpand = retailerKey;
        else listRef = stmRetailerListRefs.current.get(retailer) ?? null;
      }
    } else if (ungroupedProjects.some((g) => g.id === activeGroupId)) {
      listRef = ungroupedListRef.current;
    } else if (archivedGroups.some((g) => g.id === activeGroupId)) {
      if (!showArchived) {
        // Archive section is collapsed — open it first; the next render
        // will retrigger this effect and we'll scroll then.
        setShowArchived(true);
        return;
      }
      listRef = archivedListRef.current;
    } else {
      const folderId = groupFolderMap.get(activeGroupId);
      if (folderId) {
        if (!expandedFolders.has(folderId)) needsFolderExpand = folderId;
        else listRef = folderListRefs.current.get(folderId) ?? null;
      }
    }

    if (needsFolderExpand) {
      setExpandedFolders((prev) => {
        if (prev.has(needsFolderExpand!)) return prev;
        const next = new Set(prev);
        next.add(needsFolderExpand!);
        return next;
      });
      return; // Effect will re-run after expansion.
    }

    if (!listRef) return;
    // Coalesced through the queue: rapid activeGroupId changes (keyboard
    // navigation, deep-link bursts) collapse to a single scroll on the
    // last id only.
    requestScroll("active", {
      kind: "list",
      list: listRef,
      id: activeGroupId,
      align: "center",
    });
  }, [
    activeGroupId, showGroups, showArchived,
    expandedFolders, npdRootGroups, stmRootGroups, ungroupedProjects, archivedGroups, groupFolderMap,
    requestScroll,
  ]);

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

    // Edge case: dropped on self → nothing to do (and avoid useless mutation).
    if (activeId === overId) return;

    // Edge case: active project disappeared mid-drag (realtime delete,
    // moved by another tab). Bail out instead of writing stale positions.
    const activeExists =
      ungroupedProjects.some((g) => g.id === activeId) ||
      npdRootGroups.some((g) => g.id === activeId) ||
      archivedGroups.some((g) => g.id === activeId) ||
      (groupFolderMap.has(activeId) &&
        folders.some((f) => f.id === groupFolderMap.get(activeId)));
    if (!activeExists) return;

    // ----- Drops on folder/section headers (empty space, FolderRow) -----

    if (overId.startsWith("folder:")) {
      const folderId = overId.replace("folder:", "");
      const inSameFolder = groupFolderMap.get(activeId) === folderId;
      if (!inSameFolder) {
        // Move into folder; backend assigns position at the end.
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: folderId });
      } else {
        // Already in this folder — interpret drop on the header as
        // "move to top of folder" so the gesture isn't a confusing no-op.
        const list = groupsInFolder(folderId);
        const oldIndex = list.findIndex((g) => g.id === activeId);
        if (oldIndex > 0) {
          const reordered = arrayMove(list, oldIndex, 0);
          reorderGroups.mutate(reordered.map((g, i) => ({ id: g.id, position: i })));
        }
      }
      return;
    }

    if (overId === "ungrouped-drop") {
      const inUngrouped = !groupFolderMap.has(activeId)
        && !npdRootGroups.some((g) => g.id === activeId)
        && !archivedGroups.some((g) => g.id === activeId);
      if (!inUngrouped) {
        // Coming from a folder / NPD / archive → move into ungrouped.
        // (Archive entries shouldn't normally be drag targets, but guard.)
        moveProjectToFolder.mutate({ group_id: activeId, folder_id: null });
      } else {
        // Already ungrouped — drop on empty space means "send to end".
        const list = ungroupedProjects;
        const oldIndex = list.findIndex((g) => g.id === activeId);
        if (oldIndex !== -1 && oldIndex !== list.length - 1) {
          const reordered = arrayMove(list, oldIndex, list.length - 1);
          reorderGroups.mutate(reordered.map((g, i) => ({ id: g.id, position: i })));
        }
      }
      return;
    }

    // ----- Drops on another project row -----

    const overProject = rootGroups.find((g) => g.id === overId);
    // Unknown drop target: child-group row, ghost id, deleted node, etc.
    // Silent bail — `closestCenter` can pick those during fast drags.
    if (!overProject) return;

    const activeFolder = groupFolderMap.get(activeId) ?? null;
    const overFolder = groupFolderMap.get(overId) ?? null;

    if (activeFolder !== overFolder) {
      moveProjectToFolder.mutate({ group_id: activeId, folder_id: overFolder });
      return;
    }

    // Same folder — but folder=null splits into THREE distinct buckets
    // (NPD, archived, ungrouped). pickList must agree for both ids,
    // otherwise we'd silently no-op (or worse, write a wrong reorder).
    const pickList = (id: string): TaskGroup[] | null => {
      if (npdRootGroups.some((g) => g.id === id)) return npdRootGroups;
      if (archivedGroups.some((g) => g.id === id)) return archivedGroups;
      if (ungroupedProjects.some((g) => g.id === id)) return ungroupedProjects;
      const fid = groupFolderMap.get(id);
      if (fid) return groupsInFolder(fid);
      return null;
    };

    const activeList = pickList(activeId);
    const overList = pickList(overId);

    // Cross-segment reorder (e.g. drag NPD project onto an Ungrouped row):
    // both have folder=null so the earlier `activeFolder !== overFolder`
    // check passed, but they live in different visual lists. Project type
    // change isn't supported by reorder, so refuse and let the user use the
    // dedicated NPD migration / archive UI.
    if (!activeList || !overList || activeList !== overList) return;

    const oldIndex = activeList.findIndex((g) => g.id === activeId);
    const newIndex = activeList.findIndex((g) => g.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(activeList, oldIndex, newIndex);
    reorderGroups.mutate(reordered.map((g, i) => ({ id: g.id, position: i })));
  }, [
    groupFolderMap, moveProjectToFolder, rootGroups, ungroupedProjects,
    npdRootGroups, archivedGroups, folders, groupsInFolder, reorderGroups,
  ]);

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
                    ref={(el) => folderRowRefs.current.set("__npd__", el)}
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
                    <VirtualGroupList
                      ref={npdListRef}
                      className="space-y-0.5"
                      items={npdRootGroups}
                      renderItem={renderGroup}
                    />
                  )}
                </div>
              )}

              {/* Virtual STM folder — SKU projects grouped by retailer, collapsed by default */}
              {stmRootGroups.length > 0 && (
                <div>
                  <div
                    ref={(el) => folderRowRefs.current.set("__stm__", el)}
                    className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-sidebar-fg/70 hover:bg-sidebar-hover cursor-pointer transition-colors"
                    onClick={() => handleToggleFolder("__stm__")}
                  >
                    <span className="shrink-0">
                      {expandedFolders.has("__stm__") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <span className="shrink-0">🏷️</span>
                    <span className="truncate flex-1 text-left font-medium">СТМ продукты</span>
                    <span className="text-[10px] text-sidebar-fg/40">{stmRootGroups.length}</span>
                  </div>
                  {expandedFolders.has("__stm__") && (
                    <div className="space-y-0.5 pl-3">
                      {stmByRetailer.map(([retailer, items]) => {
                        const key = `__stm__:${retailer}`;
                        const isOpen = expandedFolders.has(key);
                        return (
                          <div key={key}>
                            <div
                              className="group flex items-center gap-2 px-3 py-1 rounded-lg text-xs text-sidebar-fg/60 hover:bg-sidebar-hover cursor-pointer transition-colors"
                              onClick={() => handleToggleFolder(key)}
                            >
                              <span className="shrink-0">
                                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </span>
                              <span className="truncate flex-1 text-left">{retailer}</span>
                              <span className="text-[10px] text-sidebar-fg/40">{items.length}</span>
                            </div>
                            {isOpen && (
                              <VirtualGroupList
                                ref={(h) => {
                                  // Register handle on mount; unregister on unmount.
                                  // Returning a cleanup works on React 19 ref-callbacks;
                                  // the explicit null-check covers older React behaviour
                                  // where the same callback is invoked with null.
                                  if (h === null) {
                                    stmRetailerListRefs.current.delete(retailer);
                                    return;
                                  }
                                  stmRetailerListRefs.current.set(retailer, h);
                                  return () => {
                                    stmRetailerListRefs.current.delete(retailer);
                                  };
                                }}
                                className="space-y-0.5"
                                items={items}
                                renderItem={renderGroup}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Folders with projects */}
              {folders.map((folder) => {
                const folderProjects = groupsInFolder(folder.id);
                const isExpanded = expandedFolders.has(folder.id);
                return (
                  <DroppableFolder key={folder.id} id={folder.id} isOver={dragOverFolderId === folder.id}>
                    <div ref={(el) => folderRowRefs.current.set(folder.id, el)}>
                      <FolderRow
                        id={folder.id}
                        name={folder.name}
                        color={folder.color ?? null}
                        count={folderProjects.length}
                        expanded={isExpanded}
                        onToggle={() => handleToggleFolder(folder.id)}
                      />
                    </div>
                    {isExpanded && (
                      <VirtualGroupList
                        ref={(h) => folderListRefs.current.set(folder.id, h)}
                        className="space-y-0.5"
                        items={folderProjects}
                        renderItem={renderGroup}
                      />
                    )}
                  </DroppableFolder>
                );
              })}

              {/* Ungrouped */}
              <DroppableUngrouped isOver={dragOverFolderId === "__ungrouped__"}>
                <VirtualGroupList
                  ref={ungroupedListRef}
                  items={ungroupedProjects}
                  renderItem={renderGroup}
                />
              </DroppableUngrouped>

              {/* Archived */}
              {archivedGroups.length > 0 && (
                <div>
                  <div
                    ref={(el) => folderRowRefs.current.set("__archived__", el)}
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
                    <VirtualGroupList
                      ref={archivedListRef}
                      className="space-y-0.5 opacity-50"
                      items={archivedGroups}
                      renderItem={renderGroup}
                    />
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
        </DndContext>
      )}
    </div>
  );
}