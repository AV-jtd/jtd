import { useState, useMemo } from "react";
import { useTaskGroups } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FileBarChart, ChevronRight, Loader2, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ReportList from "@/components/report/ReportList";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function ReportsHubView() {
  const { user } = useAuth();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const [search, setSearch] = useState("");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const { data: reportPages = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["reports-hub", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_pages")
        .select("id, group_id, title, blocks, updated_at, cover_color")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const isLoading = groupsLoading || reportsLoading;

  const projectsWithReports = useMemo(() => {
    const groupIdsWithReports = new Set(reportPages.map(r => r.group_id).filter(Boolean));

    return groups
      .filter(g => groupIdsWithReports.has(g.id))
      .map(group => {
        const reports = reportPages.filter(r => r.group_id === group.id);
        const totalBlocks = reports.reduce((sum, r) => sum + (Array.isArray(r.blocks) ? (r.blocks as any[]).length : 0), 0);
        const lastUpdated = reports[0]?.updated_at || null;
        return { group, reportCount: reports.length, totalBlocks, lastUpdated };
      })
      .filter(item => {
        if (!search.trim()) return true;
        return item.group.name.toLowerCase().includes(search.toLowerCase());
      })
      .sort((a, b) => {
        const aDate = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
        const bDate = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
        return bDate - aDate;
      });
  }, [groups, reportPages, search]);

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
            <FileBarChart className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground leading-tight">Отчёты</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {projectsWithReports.length} {projectsWithReports.length === 1 ? "проект" : "проектов"} с отчётами
            </p>
          </div>
        </div>

        {/* Search */}
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
        </div>

        {/* Project cards */}
        <div className="space-y-2">
          {projectsWithReports.length === 0 ? (
            <div className="text-center py-12">
              <FileBarChart className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Нет проектов по запросу" : "Нет отчётов"}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Откройте проект → вкладка «База знаний» → создайте отчёт
              </p>
            </div>
          ) : (
            projectsWithReports.map(item => (
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
                    <span className="flex items-center gap-1">
                      <FileBarChart className="h-3 w-3" />
                      {item.reportCount} отч.
                    </span>
                    <span>{item.totalBlocks} блоков</span>
                    {item.lastUpdated && (
                      <span>· {format(parseISO(item.lastUpdated), "d MMM yyyy", { locale: ru })}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Reports dialog */}
      <Dialog open={!!openGroupId} onOpenChange={(open) => !open && setOpenGroupId(null)}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] p-4 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {openGroup && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: openGroup.color || "hsl(var(--primary))" }}
                  >
                    {openGroup.icon && !["list", "folder"].includes(openGroup.icon)
                      ? openGroup.icon
                      : openGroup.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{openGroup.name}</h2>
                </div>
                <ReportList groupId={openGroup.id} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
