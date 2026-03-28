import { useState, useMemo } from "react";
import { useTaskGroups } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BookOpen, ChevronRight, FileText, LayoutGrid, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProjectWikiTab from "@/components/wiki/ProjectWikiTab";
import { cn } from "@/lib/utils";

export default function WikiHubView() {
  const { user } = useAuth();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const [search, setSearch] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  // Fetch all wiki pages + structured sections counts per group
  const { data: wikiPages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ["wiki-hub-pages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wiki_pages")
        .select("id, group_id, title, icon, updated_at")
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

  const isLoading = groupsLoading || pagesLoading || sectionsLoading;

  // Build list of groups that have wiki content
  const projectsWithWiki = useMemo(() => {
    const groupMap = new Map(groups.map(g => [g.id, g]));

    // Collect group IDs that have content
    const groupIdsWithPages = new Set(wikiPages.map(p => p.group_id));
    const groupIdsWithSections = new Set(structuredSections.map(s => s.group_id));
    const allGroupIds = new Set([...groupIdsWithPages, ...groupIdsWithSections]);

    return Array.from(allGroupIds)
      .map(gId => {
        const group = groupMap.get(gId);
        if (!group) return null;

        const pages = wikiPages.filter(p => p.group_id === gId);
        const sections = structuredSections.filter(s => s.group_id === gId);
        const filledSections = sections.filter(s => s.content && s.content.trim().length > 0);
        const lastUpdated = pages[0]?.updated_at || null;

        return {
          group,
          pageCount: pages.length,
          sectionCount: filledSections.length,
          lastUpdated,
        };
      })
      .filter(Boolean)
      .filter(item => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return item!.group.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // Sort by last updated
        const aDate = a!.lastUpdated ? new Date(a!.lastUpdated).getTime() : 0;
        const bDate = b!.lastUpdated ? new Date(b!.lastUpdated).getTime() : 0;
        return bDate - aDate;
      }) as { group: typeof groups[0]; pageCount: number; sectionCount: number; lastUpdated: string | null }[];
  }, [groups, wikiPages, structuredSections, search]);

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
              {projectsWithWiki.length} {projectsWithWiki.length === 1 ? "проект" : "проектов"} с контентом
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск проекта..."
            className="pl-9 h-9"
          />
        </div>

        {/* Project cards */}
        <div className="space-y-2">
          {projectsWithWiki.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Нет проектов по запросу" : "Ни один проект ещё не имеет базы знаний"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Откройте проект → вкладка «База знаний» чтобы начать
              </p>
            </div>
          ) : (
            projectsWithWiki.map(item => (
              <button
                key={item.group.id}
                onClick={() => setOpenGroupId(item.group.id)}
                className="w-full flex items-center gap-3 p-4 bg-card rounded-xl border border-border hover:border-primary/30 hover:shadow-sm transition-all text-left group"
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
                  <span className="font-medium text-sm text-foreground truncate block">
                    {item.group.name}
                  </span>
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
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
