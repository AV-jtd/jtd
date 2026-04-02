import { useState, useEffect, useCallback } from "react";
import { useWikiPages, useWikiMutations, WikiPage } from "@/hooks/useWiki";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Plus, ChevronRight, Trash2, FileText, Edit3, Save, X,
  Download, FileDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";

import { EMOJI_CATEGORIES } from "@/lib/emojiCategories";

const ICONS = EMOJI_CATEGORIES.flatMap(c => c.emojis).slice(0, 30);

interface WikiEditorProps {
  groupId: string;
  groupName: string;
  compact?: boolean;
}

export default function WikiEditor({ groupId, groupName, compact }: WikiEditorProps) {
  const { data: pages = [], isLoading } = useWikiPages(groupId);
  const { createPage, updatePage, deletePage } = useWikiMutations(groupId);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIcon, setEditIcon] = useState("📄");

  const rootPages = pages.filter(p => !p.parent_page_id);
  const selectedPage = pages.find(p => p.id === selectedPageId);
  const childPages = pages.filter(p => p.parent_page_id === selectedPageId);

  useEffect(() => {
    if (!selectedPageId && rootPages.length > 0) {
      setSelectedPageId(rootPages[0].id);
    }
  }, [rootPages, selectedPageId]);

  useEffect(() => {
    if (selectedPage) {
      setEditTitle(selectedPage.title);
      setEditContent(selectedPage.content || "");
      setEditIcon(selectedPage.icon || "📄");
    }
  }, [selectedPage]);

  const handleSave = useCallback(() => {
    if (!selectedPage) return;
    updatePage.mutate({
      id: selectedPage.id,
      title: editTitle,
      content: editContent,
      icon: editIcon,
    });
    setEditing(false);
  }, [selectedPage, editTitle, editContent, editIcon, updatePage]);

  const handleCreate = (parentId?: string) => {
    createPage.mutate({ parentPageId: parentId || null }, {
      onSuccess: (data: any) => {
        setSelectedPageId(data.id);
        setEditing(true);
      }
    });
  };

  const handleDelete = () => {
    if (!selectedPage) return;
    deletePage.mutate(selectedPage.id);
    setSelectedPageId(rootPages.find(p => p.id !== selectedPage.id)?.id || null);
    setEditing(false);
  };

  const height = compact ? "h-[400px]" : "h-[calc(85vh-120px)]";

  return (
    <div className={`flex ${height} border rounded-xl overflow-hidden bg-background`}>
      {/* Sidebar */}
      <div className="w-52 border-r bg-muted/30 p-2 flex flex-col">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Страницы</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleCreate()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-0.5">
            {rootPages.map(page => (
              <PageTreeItem
                key={page.id}
                page={page}
                pages={pages}
                selectedId={selectedPageId}
                onSelect={setSelectedPageId}
                onCreateChild={(id) => handleCreate(id)}
              />
            ))}
            {rootPages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
                <p className="text-xs text-muted-foreground">Нет страниц</p>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCreate()}>
                  <Plus className="h-3 w-3" /> Добавить знание
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 mt-1 w-full justify-start text-muted-foreground hover:text-primary" onClick={() => handleCreate()}>
          <Plus className="h-3 w-3" /> Добавить знание
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">
        {selectedPage ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b">
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1">
                <span>{groupName}</span>
                <ChevronRight className="h-3 w-3" />
                {selectedPage.parent_page_id && (
                  <>
                    <span>{pages.find(p => p.id === selectedPage.parent_page_id)?.title}</span>
                    <ChevronRight className="h-3 w-3" />
                  </>
                )}
                <span className="text-foreground font-medium">{selectedPage.title}</span>
              </div>
              <div className="flex items-center gap-1">
                {editing ? (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleSave}>
                      <Save className="h-3 w-3" /> Сохранить
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEditing(true)}>
                      <Edit3 className="h-3 w-3" /> Редактировать
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCreate(selectedPage.id)}>
                      <Plus className="h-3 w-3" /> Подстраница
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={handleDelete}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Editor / Viewer */}
            <ScrollArea className="flex-1">
              <div className="max-w-2xl mx-auto p-6">
                {editing ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-2xl hover:bg-muted rounded p-1 transition-colors">
                            {editIcon}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2">
                          <div className="grid grid-cols-5 gap-1">
                            {ICONS.map(ic => (
                              <button
                                key={ic}
                                onClick={() => setEditIcon(ic)}
                                className={cn("text-xl p-1.5 rounded hover:bg-muted", editIcon === ic && "bg-primary/10")}
                              >
                                {ic}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="text-xl font-bold border-0 p-0 h-auto focus-visible:ring-0 bg-transparent"
                        placeholder="Название страницы"
                      />
                    </div>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[300px] resize-none text-sm font-mono"
                      placeholder="Содержание страницы (Markdown поддерживается)..."
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Поддерживается Markdown: # заголовки, **жирный**, *курсив*, - списки, @задача-id для ссылок
                    </p>
                  </div>
                ) : (
                  <div>
                    <h1 className="text-2xl font-bold mb-1 flex items-center gap-3">
                      {selectedPage.icon} {selectedPage.title}
                    </h1>
                    <p className="text-xs text-muted-foreground mb-6">
                      Обновлено: {new Date(selectedPage.updated_at).toLocaleDateString("ru-RU")}
                    </p>
                    
                    {selectedPage.content ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{selectedPage.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Нажмите «Редактировать» чтобы добавить содержание...
                      </p>
                    )}

                    {/* Child pages links */}
                    {childPages.length > 0 && (
                      <div className="mt-8 space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">Подстраницы</h3>
                        {childPages.map(cp => (
                          <button
                            key={cp.id}
                            onClick={() => setSelectedPageId(cp.id)}
                            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-sm transition-colors"
                          >
                            <span>{cp.icon}</span>
                            <span>{cp.title}</span>
                            <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Создайте первую страницу</p>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => handleCreate()}>
                <Plus className="h-3 w-3" /> Новая страница
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PageTreeItem({ page, pages, selectedId, onSelect, onCreateChild }: {
  page: WikiPage;
  pages: WikiPage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
}) {
  const children = pages.filter(p => p.parent_page_id === page.id);
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => onSelect(page.id)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors group",
          selectedId === page.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
        )}
      >
        {children.length > 0 && (
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 transition-transform", expanded && "rotate-90")}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          />
        )}
        <span className="shrink-0">{page.icon}</span>
        <span className="truncate flex-1 text-left">{page.title}</span>
        <Plus
          className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0"
          onClick={(e) => { e.stopPropagation(); onCreateChild(page.id); }}
        />
      </button>
      {expanded && children.length > 0 && (
        <div className="ml-3 border-l border-border/50 pl-1.5 mt-0.5 space-y-0.5">
          {children.map(child => (
            <PageTreeItem
              key={child.id}
              page={child}
              pages={pages}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}
