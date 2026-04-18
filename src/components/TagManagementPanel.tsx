import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useVisibleTags, useTagCategories, useTaskMutations } from "@/hooks/useTasks";
import {
  Tag as TagIcon, Plus, Trash2, ChevronDown, ChevronRight,
  Share2, FolderPlus, FolderOpen, Send, GripVertical,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import ConfirmDelete from "@/components/ConfirmDelete";
import { cn } from "@/lib/utils";

const TAG_COLORS = [
  "hsl(var(--tag-blue))", "hsl(var(--tag-green))", "hsl(var(--tag-orange))",
  "hsl(var(--tag-purple))", "hsl(var(--tag-red))", "hsl(var(--tag-yellow))",
  "hsl(var(--tag-pink))", "hsl(var(--tag-teal))",
];

/**
 * Standalone tag management UI: categories, subcategories, tags, sharing, DnD between categories.
 * Used in Settings page (extracted from AppSidebar).
 */
export default function TagManagementPanel() {
  const { user } = useAuth();
  const { data: tags = [] } = useVisibleTags();
  const { data: tagCategories = [] } = useTagCategories();
  const {
    addTag, renameTag, deleteTag, grantTagAccess,
    addTagCategory, renameTagCategory, deleteTagCategory, updateTagCategory,
  } = useTaskMutations();

  const [newTagName, setNewTagName] = useState("");
  const [newTagCategoryId, setNewTagCategoryId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [tagShareEmail, setTagShareEmail] = useState("");

  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newSubcategoryParentId, setNewSubcategoryParentId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["__uncategorized__"]));

  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);

  // Map: my category id -> Set of all category ids (mine + others') with matching name+parent_name
  const categoryIdMapping = useMemo(() => {
    const myCats = tagCategories.filter(c => c.user_id === user?.id);
    const otherCats = tagCategories.filter(c => c.user_id !== user?.id);
    const catNameById = new Map(tagCategories.map(c => [c.id, c.name]));
    const getPathKey = (cat: { id: string; name: string; parent_id?: string | null }) => {
      const parentName = cat.parent_id ? catNameById.get(cat.parent_id) || "" : "";
      return parentName ? `${parentName}/${cat.name}` : cat.name;
    };
    const mapping = new Map<string, Set<string>>();
    for (const myCat of myCats) {
      const key = getPathKey(myCat);
      const matchingIds = new Set([myCat.id]);
      for (const other of otherCats) {
        if (getPathKey(other) === key) matchingIds.add(other.id);
      }
      mapping.set(myCat.id, matchingIds);
    }
    return mapping;
  }, [tagCategories, user?.id]);

  const allMappedCategoryIds = useMemo(() => {
    const ids = new Set<string>();
    categoryIdMapping.forEach(set => set.forEach(id => ids.add(id)));
    return ids;
  }, [categoryIdMapping]);

  const handleAddTag = (categoryId?: string | null) => {
    if (newTagName.trim()) {
      const color = TAG_COLORS[tags.length % TAG_COLORS.length];
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
      setNewSubcategoryParentId(null);
    }
  };

  const handleSaveCategoryName = (id: string) => {
    if (editingCategoryName.trim()) {
      renameTagCategory.mutate({ id, name: editingCategoryName.trim() });
    }
    setEditingCategoryId(null);
  };

  const handleSaveTagName = (id: string) => {
    if (editingTagName.trim()) {
      renameTag.mutate({ id, name: editingTagName.trim() });
    }
    setEditingTagId(null);
  };

  const handleShareTag = (tagId: string) => {
    if (tagShareEmail.trim()) {
      grantTagAccess.mutate({ tag_id: tagId, user_email: tagShareEmail.trim() });
      setTagShareEmail("");
    }
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  };

  const renderTagItem = (t: typeof tags[number]) => (
    <div
      key={t.id}
      className={cn("group", draggingTagId === t.id && "opacity-40")}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("tag-id", t.id); setDraggingTagId(t.id); }}
      onDragEnd={() => { setDraggingTagId(null); setDragOverCategoryId(null); }}
    >
      <div className="flex items-center">
        <GripVertical className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 cursor-grab text-muted-foreground mr-0.5" />
        <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-sm hover:bg-accent/50">
          <TagIcon className="h-3.5 w-3.5 shrink-0" style={{ color: t.color || undefined }} />
          {editingTagId === t.id ? (
            <input
              autoFocus
              value={editingTagName}
              onChange={(e) => setEditingTagName(e.target.value)}
              onBlur={() => handleSaveTagName(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveTagName(t.id); if (e.key === "Escape") setEditingTagId(null); }}
              className="flex-1 bg-muted/50 rounded px-1.5 py-0.5 text-sm outline-none min-w-0"
            />
          ) : (
            <span
              className="truncate flex-1 text-left cursor-text"
              onDoubleClick={() => { setEditingTagId(t.id); setEditingTagName(t.name); }}
            >
              {t.name}
            </span>
          )}
          <div className="flex items-center gap-0.5 shrink-0">
            {t.user_id === user?.id && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent">
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" side="right">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Дать доступ к тэгу</p>
                    <form onSubmit={(e) => { e.preventDefault(); handleShareTag(t.id); }} className="flex gap-2">
                      <Input value={tagShareEmail} onChange={(e) => setTagShareEmail(e.target.value)} placeholder="Email..." className="h-7 text-xs" />
                      <button type="submit" disabled={!tagShareEmail.trim()} className="text-xs text-primary hover:text-primary/80 whitespace-nowrap disabled:opacity-30">Дать</button>
                    </form>
                  </PopoverContent>
                </Popover>
                <ConfirmDelete title="Удалить тэг?" description="Тэг будет снят со всех задач." onConfirm={() => deleteTag.mutate(t.id)}>
                  <button className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </ConfirmDelete>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderNewTagForm = (categoryId: string | null) => (
    <form onSubmit={(e) => { e.preventDefault(); handleAddTag(categoryId); setEditingTagId(null); }} className="px-2 py-1 flex items-center gap-1.5">
      <input
        autoFocus
        value={newTagName}
        onChange={(e) => setNewTagName(e.target.value)}
        onBlur={() => { setTimeout(() => { if (!newTagName.trim()) { setEditingTagId(null); setNewTagCategoryId(null); } }, 150); }}
        placeholder="Название тэга..."
        className="flex-1 bg-muted/50 rounded px-2 py-1.5 text-sm outline-none"
      />
      <button type="submit" disabled={!newTagName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          Категории организуют тэги. Перетаскивайте тэги между категориями. Двойной клик по названию — переименовать.
        </p>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button
            onClick={() => { setShowNewCategory(true); setNewSubcategoryParentId(null); }}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Новая категория"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setEditingTagId("__new__"); setNewTagCategoryId(null); setNewTagName(""); }}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Новый тэг"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1 border border-border rounded-lg p-2 max-h-[60vh] overflow-y-auto">
        {/* New category form */}
        {showNewCategory && !newSubcategoryParentId && (
          <form onSubmit={(e) => { e.preventDefault(); handleAddCategory(); }} className="px-2 py-1 flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onBlur={() => { setTimeout(() => { if (!newCategoryName.trim()) { setShowNewCategory(false); setNewSubcategoryParentId(null); } }, 150); }}
              placeholder="Категория..."
              className="flex-1 bg-muted/50 rounded px-2 py-1.5 text-sm outline-none"
            />
            <button type="submit" disabled={!newCategoryName.trim()} className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-primary hover:bg-primary/10 disabled:opacity-20 transition-all">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        )}

        {/* Root categories */}
        {tagCategories.filter(c => !c.parent_id && c.user_id === user?.id).map((cat) => {
          const subcategories = tagCategories.filter(c => c.parent_id === cat.id && c.user_id === user?.id);
          const matchingCatIds = categoryIdMapping.get(cat.id) || new Set([cat.id]);
          const catTags = tags.filter(t => matchingCatIds.has((t as any).category_id));
          const totalSubTags = subcategories.reduce((acc, sc) => acc + tags.filter(t => { const ids = categoryIdMapping.get(sc.id) || new Set([sc.id]); return ids.has((t as any).category_id); }).length, 0);
          if (catTags.length === 0 && totalSubTags === 0) return null;
          const isExpanded = expandedCategories.has(cat.id);
          return (
            <div key={cat.id}>
              <div
                className={cn("group flex items-center rounded-md", dragOverCategoryId === cat.id && "bg-primary/10")}
                onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId(cat.id); }}
                onDragLeave={() => setDragOverCategoryId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const tagId = e.dataTransfer.getData("tag-id");
                  if (tagId) updateTagCategory.mutate({ tag_id: tagId, category_id: cat.id });
                  setDragOverCategoryId(null); setDraggingTagId(null);
                }}
              >
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="flex items-center gap-2 flex-1 px-2 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors"
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
                      className="flex-1 bg-muted/50 rounded px-1.5 py-0.5 text-xs outline-none min-w-0"
                    />
                  ) : (
                    <span
                      className="truncate flex-1 text-left"
                      onDoubleClick={(e) => { e.stopPropagation(); setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                    >
                      {cat.name}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">{catTags.length + totalSubTags}</span>
                </button>
                <div className="flex items-center gap-0.5 pr-2 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowNewCategory(true); setNewSubcategoryParentId(cat.id); setNewCategoryName(""); }}
                    className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent text-muted-foreground"
                    title="Добавить подпапку"
                  >
                    <FolderPlus className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingTagId("__new__"); setNewTagCategoryId(cat.id); setNewTagName(""); }}
                    className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent text-muted-foreground"
                    title="Добавить тэг в категорию"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {cat.user_id === user?.id && (
                    <ConfirmDelete title="Удалить категорию?" description="Подкатегории и тэги останутся, но потеряют привязку." onConfirm={() => deleteTagCategory.mutate(cat.id)}>
                      <button className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent text-muted-foreground">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </ConfirmDelete>
                  )}
                </div>
              </div>
              {isExpanded && (
                <div className="space-y-0.5 ml-2">
                  {/* New subcategory form */}
                  {showNewCategory && newSubcategoryParentId === cat.id && (
                    <form onSubmit={(e) => { e.preventDefault(); handleAddCategory(cat.id); }} className="px-2 py-1 flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                      <input
                        autoFocus
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onBlur={() => { setTimeout(() => { if (!newCategoryName.trim()) { setShowNewCategory(false); setNewSubcategoryParentId(null); } }, 150); }}
                        placeholder="Подпапка..."
                        className="flex-1 bg-muted/50 rounded px-2 py-1 text-xs outline-none"
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
                    if (subTags.length === 0) return null;
                    const isSubExpanded = expandedCategories.has(subcat.id);
                    return (
                      <div key={subcat.id}>
                        <div
                          className={cn("group flex items-center rounded-md", dragOverCategoryId === subcat.id && "bg-primary/10")}
                          onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId(subcat.id); }}
                          onDragLeave={() => setDragOverCategoryId(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const tagId = e.dataTransfer.getData("tag-id");
                            if (tagId) updateTagCategory.mutate({ tag_id: tagId, category_id: subcat.id });
                            setDragOverCategoryId(null); setDraggingTagId(null);
                          }}
                        >
                          <button
                            onClick={() => toggleCategory(subcat.id)}
                            className="flex items-center gap-1.5 flex-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                                className="flex-1 bg-muted/50 rounded px-1 py-0.5 text-xs outline-none min-w-0"
                              />
                            ) : (
                              <span
                                className="truncate flex-1 text-left"
                                onDoubleClick={(e) => { e.stopPropagation(); setEditingCategoryId(subcat.id); setEditingCategoryName(subcat.name); }}
                              >
                                {subcat.name}
                              </span>
                            )}
                            <span className="text-muted-foreground text-[10px]">{subTags.length}</span>
                          </button>
                          <div className="flex items-center gap-0.5 pr-2 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingTagId("__new__"); setNewTagCategoryId(subcat.id); setNewTagName(""); }}
                              className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent text-muted-foreground"
                              title="Добавить тэг"
                            >
                              <Plus className="h-2.5 w-2.5" />
                            </button>
                            {subcat.user_id === user?.id && (
                              <ConfirmDelete title="Удалить подкатегорию?" description="Тэги останутся, но потеряют привязку." onConfirm={() => deleteTagCategory.mutate(subcat.id)}>
                                <button className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded hover:bg-accent text-muted-foreground">
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
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
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground rounded-md transition-colors", dragOverCategoryId === "__uncategorized__" && "bg-primary/10")}
                  onDragOver={(e) => { e.preventDefault(); setDragOverCategoryId("__uncategorized__"); }}
                  onDragLeave={() => setDragOverCategoryId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const tagId = e.dataTransfer.getData("tag-id");
                    if (tagId) updateTagCategory.mutate({ tag_id: tagId, category_id: null });
                    setDragOverCategoryId(null); setDraggingTagId(null);
                  }}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="truncate flex-1 text-left">Без категории</span>
                  <span className="text-muted-foreground text-xs">{uncategorized.length}</span>
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

        {tags.length === 0 && editingTagId !== "__new__" && (
          <p className="text-xs text-muted-foreground text-center py-6">
            У вас пока нет тэгов. Нажмите <Plus className="inline h-3 w-3" /> чтобы создать.
          </p>
        )}
      </div>
    </div>
  );
}
