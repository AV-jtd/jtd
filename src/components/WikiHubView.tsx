import { useState, useMemo } from "react";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BookOpen, ChevronRight, FileText, LayoutGrid, Loader2, Search, Archive, CheckCircle2, Plus, User, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProjectWikiTab from "@/components/wiki/ProjectWikiTab";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type StatusFilter = "all" | "active" | "archived";

export default function WikiHubView() {
  const { user } = useAuth();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const [search, setSearch] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [openPersonalWiki, setOpenPersonalWiki] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const qc = useQueryClient();

  // Personal wiki pages (no group_id)
  const { data: personalPages = [], isLoading: personalLoading } = useQuery({
    queryKey: ["wiki-personal-pages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_pages")
        .select("*")
        .is("group_id", null)
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createPersonalPage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wiki_pages").insert({
        user_id: user!.id,
        title: "Новое знание",
        icon: "💡",
        page_type: "wiki",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki-personal-pages"] });
      toast.success("Страница создана");
    },
  });

  const deletePersonalPage = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wiki_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wiki-personal-pages"] });
      toast.success("Страница удалена");
    },
  });

  const updatePersonalPage = useMutation({
    mutationFn: async (params: { id: string; title?: string; content?: string }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("wiki_pages").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki-personal-pages"] }),
  });

  const { data: wikiPages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ["wiki-hub-pages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_pages")
        .select("id, group_id, title, icon, content, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: structuredSections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["wiki-hub-sections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_structured_sections")
        .select("id, group_id, section_key, content")
        .neq("content", "");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isLoading = groupsLoading || pagesLoading || sectionsLoading || personalLoading;

  // Determine if a project is "archived" (all tasks completed, has tasks)
  const groupActivityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    groups.forEach(g => {
      const groupTasks = allTasks.filter(t => t.group_id === g.id);
      const activeTasks = groupTasks.filter(t => !t.is_completed);
      map.set(g.id, groupTasks.length === 0 || activeTasks.length > 0);
    });
    return map;
  }, [groups, allTasks]);

  const projectsForWiki = useMemo(() => {
    const groupIdsWithPages = new Set(wikiPages.map(p => p.group_id));
    const groupIdsWithSections = new Set(structuredSections.map(s => s.group_id));

    return groups
      .map(group => {
        const pages = wikiPages.filter(p => p.group_id === group.id);
        const sections = structuredSections.filter(s => s.group_id === group.id);
        const filledSections = sections.filter(s => s.content && s.content.trim().length > 0);
        const lastUpdated = pages[0]?.updated_at || null;
        const hasWikiContent = pages.some(p => p.content && p.content.trim().length > 0);
        const hasContent = hasWikiContent || filledSections.length > 0 || groupIdsWithPages.has(group.id) || groupIdsWithSections.has(group.id);
        const isActive = groupActivityMap.get(group.id) ?? true;

        // Build a short preview from the first filled section or wiki page content
        const previewSection = filledSections[0];
        const filledPage = pages.find(p => p.content && p.content.trim().length > 0);
        const rawPreview = previewSection?.content || filledPage?.content || null;
        const previewText = rawPreview
          ? rawPreview.replace(/[#*_\[\]()>`]/g, "").trim().slice(0, 120)
          : null;

        return { group, pageCount: pages.length, sectionCount: filledSections.length, lastUpdated, hasContent, isActive, previewText };
      })
      .filter(item => {
        if (!item.hasContent) return false;
        if (statusFilter === "active" && !item.isActive) return false;
        if (statusFilter === "archived" && item.isActive) return false;
        if (!search.trim()) return true;
        return item.group.name.toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bDate - aDate;
      });
  }, [groups, wikiPages, structuredSections, search, statusFilter, groupActivityMap]);

  const openGroup = openGroupId ? groups.find(g => g.id === openGroupId) : null;

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground leading-tight">База знаний</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectsForWiki.length} {projectsForWiki.length === 1 ? "проект" : "проектов"} с контентом
            </p>
          </div>
        </div>

        {/* Search + status filter */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск проекта..."
              className="pl-9 h-9"
            />
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-muted/50 rounded-lg shrink-0">
            {([
              { key: "all" as StatusFilter, label: "Все" },
              { key: "active" as StatusFilter, label: "Активные" },
              { key: "archived" as StatusFilter, label: "Архив" },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                  statusFilter === opt.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project cards */}
        <div className="space-y-2">
          {projectsForWiki.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Нет проектов по запросу" : statusFilter !== "all" ? "Нет проектов с таким статусом" : "Ни один проект ещё не имеет базы знаний"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Откройте проект → вкладка «База знаний» чтобы начать
              </p>
            </div>
          ) : (
            projectsForWiki.map(item => (
              <button
                key={item.group.id}
                onClick={() => setOpenGroupId(item.group.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all text-left group",
                  !item.isActive && "opacity-60"
                )}
              >
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-semibold"
                  style={{ backgroundColor: item.group.color || "hsl(var(--primary))" }}
                >
                  {item.group.icon && !["list", "folder"].includes(item.group.icon)
                    ? item.group.icon
                    : item.group.name.charAt(0).toUpperCase()
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {item.group.name}
                    </span>
                    {item.isActive ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium shrink-0">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Активный
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium shrink-0">
                        <Archive className="h-2.5 w-2.5" />
                        Архив
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    {item.pageCount > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {item.pageCount} стр.
                      </span>
                    )}
                    {item.sectionCount > 0 && (
                      <span className="flex items-center gap-1">
                        <LayoutGrid className="h-3 w-3" />
                        {item.sectionCount} секц.
                      </span>
                    )}
                  </div>
                  {item.previewText && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
                      {item.previewText}{item.previewText.length >= 120 ? "…" : ""}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Wiki dialog */}
      <Dialog open={!!openGroupId} onOpenChange={(open) => !open && setOpenGroupId(null)}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] p-4 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {openGroup && (
              <ProjectWikiTab
                groupId={openGroup.id}
                groupName={openGroup.name}
                groupDescription={openGroup.description || undefined}
                defaultTab="structured"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
