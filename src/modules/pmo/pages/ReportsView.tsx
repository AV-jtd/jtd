import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ExternalLink, Trash2, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

interface Report {
  id: string;
  title: string;
  token: string;
  created_at: string;
  expires_at: string;
  ai_summary: string | null;
  report_data: any;
}

export default function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dashboard_reports")
      .select("id, title, token, created_at, expires_at, ai_summary, report_data")
      .order("created_at", { ascending: false })
      .limit(50);
    setReports((data as Report[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("dashboard_reports").delete().eq("id", id);
    if (error) { toast.error("Ошибка удаления"); return; }
    setReports(prev => prev.filter(r => r.id !== id));
    toast.success("Отчёт удалён");
  };

  const getReportUrl = (token: string) =>
    `${window.location.origin}/report?token=${token}`;

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 py-16">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Нет отчётов</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Создайте отчёт в дашборде проектов — нажмите кнопку «Отчёт»
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <BarChart3 className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground leading-tight">Отчёты</h1>
          <p className="text-xs text-muted-foreground">{reports.length} сохранённых</p>
        </div>
      </div>

      <div className="space-y-2">
        {reports.map(report => {
          const expired = isExpired(report.expires_at);
          const summary = report.report_data?.summary;
          return (
            <div
              key={report.id}
              className="bg-card border border-border rounded-xl p-3.5 flex items-start gap-3 group hover:border-primary/20 transition-colors"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{report.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(report.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                  </span>
                  {expired ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">Истёк</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Активен</span>
                  )}
                </div>
                {summary && (
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{summary.completionRate}% прогресс</span>
                    <span>·</span>
                    <span>{summary.totalProjects} проектов</span>
                    {summary.totalOverdue > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-red-500">{summary.totalOverdue} просрочено</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!expired && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(getReportUrl(report.token), "_blank")}
                    title="Открыть отчёт"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(report.id)}
                  title="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
