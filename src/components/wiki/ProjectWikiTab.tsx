import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BookOpen, LayoutGrid, FileDown, Presentation, Maximize2, Minimize2 } from "lucide-react";
import WikiEditor from "./WikiEditor";
import StructuredOverview from "./StructuredOverview";
import { useWikiPages } from "@/hooks/useWiki";
import { useTasks } from "@/hooks/useTasks";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ProjectWikiTabProps {
  groupId: string;
  groupName: string;
  groupDescription?: string;
  compact?: boolean;
  defaultTab?: "wiki" | "structured";
}

export default function ProjectWikiTab({ groupId, groupName, groupDescription, compact, defaultTab }: ProjectWikiTabProps) {
  const [exporting, setExporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(defaultTab || "structured");
  const { data: pages = [] } = useWikiPages(groupId);
  const { data: tasks = [] } = useTasks(groupId);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const content = buildExportContent(groupName, pages, tasks);
      const blob = new Blob([content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => {
          win.print();
          URL.revokeObjectURL(url);
        }, 500);
      }
      toast.success("Откроется окно печати — выберите «Сохранить как PDF»");
    } catch (err: any) {
      toast.error("Ошибка экспорта: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPptHtml = async () => {
    setExporting(true);
    try {
      const content = buildPresentationHtml(groupName, pages, tasks);
      const blob = new Blob([content], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${groupName}_presentation.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Презентация скачана — откройте в браузере для показа");
    } catch (err: any) {
      toast.error("Ошибка экспорта: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const toolbar = (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExportPdf} disabled={exporting}>
        <FileDown className="h-3 w-3" /> PDF
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleExportPptHtml} disabled={exporting}>
        <Presentation className="h-3 w-3" /> PPT
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setFullscreen(!fullscreen)}
      >
        {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
      </Button>
    </div>
  );

  const wikiContent = (isFullscreen: boolean) => (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <div className="flex items-center justify-between">
        <TabsList className="h-8">
          <TabsTrigger value="wiki" className="text-xs gap-1 h-7 px-3">
            <BookOpen className="h-3 w-3" /> Wiki
          </TabsTrigger>
          <TabsTrigger value="structured" className="text-xs gap-1 h-7 px-3">
            <LayoutGrid className="h-3 w-3" /> Обзор
          </TabsTrigger>
        </TabsList>
        {toolbar}
      </div>
      <TabsContent value="wiki" className="mt-2">
        <WikiEditor groupId={groupId} groupName={groupName} compact={!isFullscreen} />
      </TabsContent>
      <TabsContent value="structured" className="mt-2">
        <StructuredOverview groupId={groupId} groupName={groupName} groupDescription={groupDescription} compact={!isFullscreen} />
      </TabsContent>
    </Tabs>
  );

  return (
    <>
      <div className="space-y-2">
        {wikiContent(false)}
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] p-4 flex flex-col">
          <div className="flex-1 overflow-hidden">
            {wikiContent(true)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Export helpers ──

function buildExportContent(name: string, pages: any[], tasks: any[]) {
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completed = tasks.filter(t => t.is_completed);
  const progress = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const pagesHtml = pages
    .filter(p => !p.parent_page_id)
    .map(p => {
      const children = pages.filter(c => c.parent_page_id === p.id);
      return `
        <div class="page">
          <h2>${p.icon} ${p.title}</h2>
          <div class="content">${(p.content || "").replace(/\n/g, "<br/>")}</div>
          ${children.map(c => `
            <div class="subpage">
              <h3>${c.icon} ${c.title}</h3>
              <div class="content">${(c.content || "").replace(/\n/g, "<br/>")}</div>
            </div>
          `).join("")}
        </div>`;
    }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 40px auto; color: #1a1a1a; }
  h1 { font-size: 28px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
  h2 { font-size: 20px; margin-top: 32px; color: #1e40af; }
  h3 { font-size: 16px; margin-left: 16px; color: #374151; }
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
  .metric { background: #f0f9ff; border-radius: 8px; padding: 16px; text-align: center; }
  .metric .value { font-size: 24px; font-weight: bold; color: #3b82f6; }
  .metric .label { font-size: 12px; color: #6b7280; }
  .content { color: #4b5563; line-height: 1.6; }
  .subpage { margin-left: 24px; border-left: 2px solid #e5e7eb; padding-left: 16px; }
  @media print { body { margin: 20px; } }
</style></head><body>
  <h1>${name}</h1>
  <div class="metrics">
    <div class="metric"><div class="value">${progress}%</div><div class="label">Прогресс</div></div>
    <div class="metric"><div class="value">${completed.length}/${tasks.length}</div><div class="label">Задач</div></div>
    <div class="metric"><div class="value">${activeTasks.length}</div><div class="label">Активных</div></div>
  </div>
  ${pagesHtml}
</body></html>`;
}

function buildPresentationHtml(name: string, pages: any[], tasks: any[]) {
  const completed = tasks.filter(t => t.is_completed);
  const progress = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;
  
  const slides = [
    // Title slide
    `<div class="slide title-slide">
      <h1>${name}</h1>
      <p class="subtitle">Обзор проекта · ${new Date().toLocaleDateString("ru-RU")}</p>
    </div>`,
    // Metrics slide
    `<div class="slide">
      <h2>Статус проекта</h2>
      <div class="metrics">
        <div class="metric"><div class="value">${progress}%</div><div class="label">Прогресс</div></div>
        <div class="metric"><div class="value">${completed.length}/${tasks.length}</div><div class="label">Задач выполнено</div></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
    </div>`,
    // Pages as slides
    ...pages.filter(p => !p.parent_page_id).map(p => `
      <div class="slide">
        <h2>${p.icon} ${p.title}</h2>
        <div class="body">${(p.content || "Нет содержания").replace(/\n/g, "<br/>")}</div>
      </div>
    `),
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name} — Презентация</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
  .slide { width: 100vw; height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 80px; }
  .title-slide { align-items: center; text-align: center; }
  .title-slide h1 { font-size: 64px; margin-bottom: 16px; }
  .subtitle { font-size: 20px; color: #94a3b8; }
  h2 { font-size: 40px; margin-bottom: 32px; color: #60a5fa; }
  .body { font-size: 20px; line-height: 1.8; color: #cbd5e1; }
  .metrics { display: flex; gap: 48px; margin-bottom: 32px; }
  .metric { text-align: center; }
  .metric .value { font-size: 56px; font-weight: bold; color: #60a5fa; }
  .metric .label { font-size: 16px; color: #94a3b8; }
  .progress-bar { width: 100%; height: 8px; background: #1e293b; border-radius: 4px; }
  .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 4px; }
  @media print { .slide { page-break-after: always; } }
</style></head><body>
  ${slides.join("\n")}
  <script>
    let current = 0;
    const slides = document.querySelectorAll('.slide');
    slides.forEach((s, i) => { if (i > 0) s.style.display = 'none'; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { if (current < slides.length - 1) { slides[current].style.display = 'none'; current++; slides[current].style.display = 'flex'; } }
      if (e.key === 'ArrowLeft') { if (current > 0) { slides[current].style.display = 'none'; current--; slides[current].style.display = 'flex'; } }
    });
  </script>
</body></html>`;
}
