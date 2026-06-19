import { memo, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronDown, ChevronRight, Expand, FolderOpen, GripVertical, Loader2, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { TaskGroup, useTaskMutations, useAvailableUsers, useProjectFolders } from "@/hooks/useTasks";
import { usePrefetchOnHover } from "@/hooks/usePrefetchOnHover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import ConfirmDelete from "@/components/ConfirmDelete";
import GroupIcon from "@/components/sidebar/GroupIcon";
import HueSlider from "@/components/sidebar/HueSlider";
import { EMOJI_CATEGORIES } from "@/lib/emojiCategories";
import { cn } from "@/lib/utils";
import { COLOR_PRESETS, presetColor } from "@/components/sidebar/colorPresets";

/**
 * Single project node in the sidebar tree.
 *
 * Memoized so that hovering a sibling or toggling an unrelated section
 * doesn't re-render the whole list. Heavy state that is per-row (rename
 * input, member picker, emoji picker, folder picker) is colocated here
 * instead of lifted into AppSidebar — that's what previously caused the
 * full tree to re-render on every keystroke in any input.
 *
 * Drag handle / sortable behaviour is enabled only for root-level groups,
 * matching the previous AppSidebar logic.
 */
export interface GroupItemProps {
  group: TaskGroup;
  depth?: number;
  isActive: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  childGroups: TaskGroup[];
  groupFolderId: string | null;
  onSelect: (groupId: string) => void;
  onToggleExpand: (groupId: string) => void;
  onOpenDetail: (groupId: string) => void;
  isChildActive: (groupId: string) => boolean;
  isChildExpanded: (groupId: string) => boolean;
  getChildGroups: (groupId: string) => TaskGroup[];
  getGroupFolderId: (groupId: string) => string | null;
}

function GroupItemImpl(props: GroupItemProps) {
  const {
    group, depth = 0, isActive, isExpanded, hasChildren, childGroups, groupFolderId,
    onSelect, onToggleExpand, onOpenDetail,
    isChildActive, isChildExpanded, getChildGroups, getGroupFolderId,
  } = props;

  const isRoot = depth === 0;

  const { updateGroupAppearance, deleteGroup, addGroupMember, addGroup, moveProjectToFolder, renameGroup } = useTaskMutations();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: folders = [] } = useProjectFolders();
  const { user } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Hover-prefetch: warm the cache for this project's tasks before the click.
  // The hook is internally debounced (120ms) and dedupes per-id, so it's safe
  // to wire to mouseenter/focus on every row.
  const { prefetchTasks, cancelPrefetch } = usePrefetchOnHover();

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [showNewSubgroup, setShowNewSubgroup] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id, disabled: !isRoot });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const saveName = () => {
    if (draftName.trim() && draftName.trim() !== group.name) {
      renameGroup.mutate({ id: group.id, name: draftName.trim() });
    }
    setEditing(false);
  };

  const handleAddSubgroup = (e: FormEvent) => {
    e.preventDefault();
    if (newSubName.trim()) {
      addGroup.mutate({ name: newSubName.trim(), parent_id: group.id });
      setNewSubName("");
      setShowNewSubgroup(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/group-${group.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("protocol-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("protocol-logos").getPublicUrl(path);
      await updateGroupAppearance.mutateAsync({ id: group.id, logo_url: publicUrl });
      toast.success("Логотип обновлён");
      setEmojiOpen(false);
    } catch (e: any) {
      toast.error("Ошибка загрузки: " + (e?.message || "не удалось"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const filteredUsers = availableUsers.filter((u) => {
    if (!memberSearch.trim()) return true;
    return u.display_name?.toLowerCase().includes(memberSearch.toLowerCase());
  });

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70 z-50 relative" : ""}>
      <div className="group">
        <button
          onClick={() => onSelect(group.id)}
          onMouseEnter={() => prefetchTasks(group.id)}
          onMouseLeave={() => cancelPrefetch(group.id)}
          onFocus={() => prefetchTasks(group.id)}
          className={cn(
            "flex items-center gap-2 w-full rounded-lg text-sm transition-colors",
            depth === 0 ? "px-3 py-2" : "px-3 py-1.5",
            isActive
              ? "bg-sidebar-active/10 text-sidebar-active font-semibold border-l-2 border-sidebar-active"
              : "text-sidebar-fg/80 hover:bg-sidebar-hover",
          )}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
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
          {isRoot && (
            <span
              onClick={(e) => { e.stopPropagation(); onToggleExpand(group.id); }}
              className={cn("shrink-0 text-sidebar-fg/50 hover:text-sidebar-fg/80", hasChildren ? "cursor-pointer" : "invisible")}
              aria-hidden={!hasChildren}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          )}

          {/* Icon / Emoji */}
          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <span onClick={(e) => e.stopPropagation()} className="shrink-0 cursor-pointer hover:opacity-80">
                <GroupIcon group={group} />
              </span>
            </PopoverTrigger>
            <PopoverContent
              className="w-64 p-3"
              side="right"
              onClick={(e) => e.stopPropagation()}
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Эмодзи</p>
              <div className="flex gap-1 mb-2 flex-wrap">
                {EMOJI_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.label}
                    onClick={(e) => { e.stopPropagation(); setEmojiTab(i); }}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full transition-colors",
                      emojiTab === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-8 gap-0.5 mb-2">
                {EMOJI_CATEGORIES[emojiTab].emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { updateGroupAppearance.mutate({ id: group.id, icon: emoji }); setEmojiOpen(false); }}
                    className={cn("p-1 rounded hover:bg-accent text-sm", group.icon === emoji && "bg-accent ring-1 ring-primary")}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { updateGroupAppearance.mutate({ id: group.id, icon: "list" }); setEmojiOpen(false); }}
                className="text-xs text-muted-foreground hover:text-foreground mb-3 block"
              >
                Убрать эмодзи
              </button>
              <p className="text-xs font-medium text-muted-foreground mb-2">Логотип</p>
              <div className="flex items-center gap-2 mb-3">
                {(group as any).logo_url && (
                  <img
                    src={(group as any).logo_url}
                    alt=""
                    className="h-7 w-7 rounded object-cover ring-1 ring-border shrink-0"
                  />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); logoInputRef.current?.click(); }}
                  disabled={uploadingLogo}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {uploadingLogo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  {(group as any).logo_url ? "Заменить" : "Загрузить"}
                </button>
                {(group as any).logo_url && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateGroupAppearance.mutate({ id: group.id, logo_url: null }); }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Убрать
                  </button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.currentTarget.value = ""; }}
                />
              </div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Цвет</p>
              <div className="flex gap-1 mb-2 flex-wrap">
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.hue}
                    onClick={() => { updateGroupAppearance.mutate({ id: group.id, color: presetColor(p.hue), icon: group.icon === "list" ? "list" : undefined }); setEmojiOpen(false); }}
                    className="h-5 w-5 rounded-full transition-transform hover:scale-110 border border-border/50"
                    style={{ backgroundColor: presetColor(p.hue) }}
                    title={p.label}
                  />
                ))}
              </div>
              <HueSlider group={group} onColorChange={(id, color) => updateGroupAppearance.mutate({ id, color, icon: group.icon === "list" ? "list" : undefined })} onDone={() => setEmojiOpen(false)} />
            </PopoverContent>
          </Popover>

          {/* Name */}
          {editing ? (
            <input
              autoFocus
              enterKeyHint="done"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(false); }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-sidebar-hover/50 rounded px-1.5 py-0.5 text-sm text-sidebar-fg outline-none min-w-0"
            />
          ) : (
            <span
              className="truncate flex-1 text-left"
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setDraftName(group.name); }}
            >
              {group.name}
            </span>
          )}

          {/* Actions */}
          <div className={cn("items-center gap-0.5 shrink-0", isActive ? "flex opacity-60" : "hidden group-hover:flex")}>
            {isRoot && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewSubgroup(true);
                  if (!isExpanded) onToggleExpand(group.id);
                }}
                className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
                title="Добавить подпроект"
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
            )}

            <Popover open={memberOpen} onOpenChange={(o) => { setMemberOpen(o); if (!o) setMemberSearch(""); }}>
              <PopoverTrigger asChild>
                <span onClick={(e) => e.stopPropagation()} className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100" title="Добавить участника">
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
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                  ) : (
                    filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          addGroupMember.mutate({ group_id: group.id, user_id: u.id, role: "participant" });
                          setMemberOpen(false);
                          setMemberSearch("");
                        }}
                        className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium">{u.display_name || "Без имени"}</span>
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <span
              onClick={(e) => { e.stopPropagation(); onOpenDetail(group.id); }}
              className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100"
              title="Карточка проекта"
            >
              <Expand className="h-3.5 w-3.5" />
            </span>

            {isRoot && folders.length > 0 && (
              <Popover open={folderOpen} onOpenChange={setFolderOpen}>
                <PopoverTrigger asChild>
                  <span onClick={(e) => e.stopPropagation()} className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100" title="Переместить в папку">
                    <FolderOpen className="h-3.5 w-3.5" />
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1.5" side="right" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs font-medium text-muted-foreground px-2 py-1">Папка</p>
                  {groupFolderId && (
                    <button
                      onClick={() => { moveProjectToFolder.mutate({ group_id: group.id, folder_id: null }); setFolderOpen(false); }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground"
                    >
                      Без папки
                    </button>
                  )}
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => { moveProjectToFolder.mutate({ group_id: group.id, folder_id: f.id }); setFolderOpen(false); }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors",
                        groupFolderId === f.id && "bg-muted text-primary font-medium",
                      )}
                    >
                      <FolderOpen className="h-3 w-3" />
                      {f.name}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            <ConfirmDelete
              title="Удалить проект?"
              description={isRoot && hasChildren ? "Все подпроекты тоже будут удалены." : "Задачи потеряют привязку."}
              onConfirm={() => deleteGroup.mutate(group.id)}
            >
              <span onClick={(e) => e.stopPropagation()} className="p-0.5 cursor-pointer opacity-60 hover:!opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
            </ConfirmDelete>
          </div>
        </button>
      </div>

      {/* Children + add-subproject form */}
      {isRoot && isExpanded && (
        <div className="space-y-0.5">
          {childGroups.map((child) => (
            <MemoGroupItem
              key={child.id}
              group={child}
              depth={1}
              isActive={isChildActive(child.id)}
              isExpanded={isChildExpanded(child.id)}
              hasChildren={getChildGroups(child.id).length > 0}
              childGroups={getChildGroups(child.id)}
              groupFolderId={getGroupFolderId(child.id)}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onOpenDetail={onOpenDetail}
              isChildActive={isChildActive}
              isChildExpanded={isChildExpanded}
              getChildGroups={getChildGroups}
              getGroupFolderId={getGroupFolderId}
            />
          ))}
          {showNewSubgroup && (
            <form onSubmit={handleAddSubgroup} className="py-1 flex items-center gap-1.5" style={{ paddingLeft: `${28 + 16}px`, paddingRight: 12 }}>
              <input
                autoFocus
                enterKeyHint="done"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onBlur={() => { setTimeout(() => { if (!newSubName.trim()) setShowNewSubgroup(false); }, 150); }}
                placeholder="Подпроект..."
                className="flex-1 bg-sidebar-hover/50 rounded px-2 py-1.5 text-sm text-sidebar-fg placeholder:text-sidebar-fg/40 outline-none"
              />
              <button type="submit" disabled={!newSubName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * React.memo with default shallow compare. Parent must pass stable callbacks
 * (useCallback) and stable selector functions for memoization to bite.
 */
const MemoGroupItem = memo(GroupItemImpl);
export default MemoGroupItem;