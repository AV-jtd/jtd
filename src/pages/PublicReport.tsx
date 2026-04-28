import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

type ReportData = {
  title: string;
  created_at: string;
  ai_summary: string | null;
  report_data: any;
};

const statusColors: Record<string, string> = {
  "on-track": "#10b981", "at-risk": "#f59e0b", "overdue": "#ef4444", "completed": "#6b7280",
};
const statusLabels: Record<string, string> = {
  "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён",
};

export default function PublicReport() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "analysis">("overview");

  useEffect(() => {
    if (!token) { setError(true); setLoading(false); return; }
    supabase
      .from("dashboard_reports")
      .select("title, created_at, ai_summary, report_data")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) setError(true);
        else setReport(data as ReportData);
        setLoading(false);
      });
  }, [token]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
      <p style={{ color: "#64748b" }}>Загрузка отчёта...</p>
    </div>
  );

  if (error || !report) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: "#ef4444", fontSize: 48, fontWeight: 700 }}>404</h1>
        <p style={{ color: "#64748b" }}>Отчёт не найден или срок действия ссылки истёк</p>
      </div>
    </div>
  );

  const d = report.report_data || {};
  const projects = d.projects || [];
  const summary = d.summary || {};
  const dateStr = new Date(report.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const periodLabel = d.periodLabel || dateStr;
  const weekTasks = d.weekTasks || [];
  const overdueTasks = d.overdueTasks || [];
  const driftTasks = d.driftTasks || [];
  const upcomingTasks = d.upcomingTasks || [];
  const completedTasks = d.completedTasks || [];
  const unassignedTasks = d.unassignedTasks || [];
  const noDeadlineTasks = d.noDeadlineTasks || [];
  const assigneeSummary = d.assigneeSummary || [];

  const wowDiff = (summary.completedThisWeek || 0) - (summary.completedLastWeek || 0);
  const wowColor = wowDiff > 0 ? "#10b981" : wowDiff < 0 ? "#ef4444" : "#64748b";

  const stepsLabel = (t: any) => t.stepsTotal > 0
    ? <span style={{ fontSize: 11, marginLeft: 4, color: t.stepsCompleted === t.stepsTotal ? "#10b981" : "#3b82f6" }}>✓{t.stepsCompleted}/{t.stepsTotal}</span>
    : null;

  const TaskTable = ({ tasks, extraHeader }: { tasks: any[]; extraHeader?: string }) => {
    const hasProjects = tasks.some((t: any) => t.project);
    if (!hasProjects) return <FlatTable tasks={tasks} extraHeader={extraHeader} />;
    const groups: Record<string, any[]> = {};
    tasks.forEach((t: any) => {
      const key = t.project || "Без проекта";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return (
      <div>
        {Object.entries(groups).map(([project, items], gi) => (
          <div key={gi} style={{ marginBottom: gi < Object.keys(groups).length - 1 ? 16 : 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", padding: "6px 12px", background: "#f0f7ff", borderRadius: 6, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              📁 {project} <span style={{ fontWeight: 400, color: "#94a3b8" }}>({items.length})</span>
            </div>
            <FlatTable tasks={items} extraHeader={extraHeader} />
          </div>
        ))}
      </div>
    );
  };

  const FlatTable = ({ tasks, extraHeader }: { tasks: any[]; extraHeader?: string }) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={thStyle}>Задача</th>
          <th style={thStyle}>Ответственный</th>
          <th style={thStyle}>Дата</th>
          {extraHeader && <th style={thStyle}>{extraHeader}</th>}
        </tr>
      </thead>
      <tbody>
        {tasks.map((t: any, i: number) => (
          <tr key={i} style={{ transition: "background .15s" }} onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <td style={{ ...tdStyle, fontWeight: 500, maxWidth: 340 }}>{t.title}{stepsLabel(t)}</td>
            <td style={{ ...tdStyle, color: !t.assignee || t.assignee === "—" ? "#f59e0b" : "inherit" }}>{!t.assignee || t.assignee === "—" ? "⚠ Не назначен" : t.assignee}</td>
            <td style={tdStyle}>{t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "—"}</td>
            {t.driftDays !== undefined && <td style={tdStyle}><span style={{ color: t.driftDays > 0 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>+{t.driftDays} дн.{t.originalDeadline ? ` (было: ${new Date(t.originalDeadline).toLocaleDateString("ru-RU")})` : ""}</span></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Section = ({ icon, title, tasks, extraHeader, defaultOpen = true, variant }: { icon: string; title: string; tasks: any[]; extraHeader?: string; defaultOpen?: boolean; variant?: string }) => {
    const [open, setOpen] = useState(defaultOpen);
    if (tasks.length === 0) return null;
    return (
      <div style={sectionStyle}>
        <h2 style={{ ...sectionHeaderStyle, cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(!open)}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {icon} {title}
            <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, background: variant === "danger" ? "#fef2f2" : variant === "warning" ? "#fffbeb" : "#f0f9ff", color: variant === "danger" ? "#ef4444" : variant === "warning" ? "#f59e0b" : "#3b82f6" }}>{tasks.length}</span>
          </span>
          <span style={{ fontSize: 14, color: "#94a3b8", transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .2s" }}>▾</span>
        </h2>
        {open && <div style={{ padding: "0 20px 16px" }}><TaskTable tasks={tasks} extraHeader={extraHeader} /></div>}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#f8fafc", color: "#1e293b", lineHeight: 1.6, minHeight: "100vh" }}>
      {/* Premium Header */}
      <div style={{ background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)", color: "#fff", padding: "32px 24px 52px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)" }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{report.title}</h1>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>Период: {periodLabel} · Создан {dateStr}</div>
      </div>

      <div style={{ maxWidth: 900, margin: "-28px auto 0", padding: "0 16px 32px", position: "relative", zIndex: 1 }}>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 0, borderRadius: 14, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", marginBottom: 20 }}>
          <Metric value={`${summary.completionRate || 0}%`} label="Прогресс" color="#3b82f6" sub={`${summary.totalTasks || 0} задач`} />
          <Metric value={summary.totalCompleted || 0} label="Выполнено" color="#10b981" sub={<span style={{ color: wowColor, fontWeight: 600 }}>{wowDiff > 0 ? "+" : ""}{wowDiff} к пр. нед</span>} />
          <Metric value={summary.totalOverdue || 0} label="Просрочено" color="#ef4444" />
          <Metric value={summary.totalDrift || 0} label="Drift" color="#f59e0b" />
          <Metric value={summary.unassignedCount || 0} label="Без ответств." color={summary.unassignedCount > 0 ? "#ea580c" : "#94a3b8"} />
          <Metric value={summary.noDeadlineCount || 0} label="Без сроков" color={summary.noDeadlineCount > 0 ? "#8b5cf6" : "#94a3b8"} />
          <Metric value={summary.activeProjects || projects.length} label="Проектов" color="#3b82f6" sub={`из ${projects.length}`} />
        </div>

        {/* Alert banners */}
        {((summary.unassignedCount || 0) > 0 || (summary.noDeadlineCount || 0) > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: (summary.unassignedCount || 0) > 0 && (summary.noDeadlineCount || 0) > 0 ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 16 }}>
            {(summary.unassignedCount || 0) > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>👤</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "#c2410c" }}>{summary.unassignedCount} задач без ответственного</div><div style={{ fontSize: 11, color: "#ea580c" }}>Требуется назначение исполнителей</div></div>
              </div>
            )}
            {(summary.noDeadlineCount || 0) > 0 && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <div><div style={{ fontSize: 13, fontWeight: 600, color: "#7c3aed" }}>{summary.noDeadlineCount} задач без сроков</div><div style={{ fontSize: 11, color: "#8b5cf6" }}>Установите дедлайны для планирования</div></div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
          {(["overview", "tasks", "analysis"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: activeTab === tab ? "1px solid #3b82f6" : "1px solid #e2e8f0",
                background: activeTab === tab ? "#3b82f6" : "#fff",
                color: activeTab === tab ? "#fff" : "#1e293b",
                cursor: "pointer", transition: "all .15s",
              }}>
              {tab === "overview" ? "📊 Обзор" : tab === "tasks" ? "📋 Задачи" : "🤖 Анализ"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
          <div style={sectionStyle}>
            <h2 style={sectionHeaderStyle}>📊 Проекты ({projects.length})</h2>
            <div style={{ padding: "0 20px 16px" }}>
              {projects.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>Нет проектов</p>}
              {projects.map((p: any, i: number) => {
                const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                const sc = statusColors[p.timingStatus] || "#6b7280";
                const sl = statusLabels[p.timingStatus] || p.timingStatus;
                const assignees = (p.assignees || []) as string[];
                return (
                  <div key={i} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 8, transition: "box-shadow .15s" }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.04)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14, flexShrink: 0, background: p.color || "#3b82f6" }}>
                        {(p.name || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {p.name}
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, border: `1px solid ${sc}30`, background: `${sc}15`, color: sc, fontWeight: 500 }}>{sl}</span>
                        </div>
                        <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, margin: "6px 0 4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: p.color || "#3b82f6", transition: "width .5s ease" }} />
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span>{pct}% · {p.completed}/{p.total} задач</span>
                          {p.overdue > 0 && <span style={{ color: "#ef4444", fontWeight: 600 }}>⚠ {p.overdue}</span>}
                          {p.driftCount > 0 && <span style={{ color: "#f59e0b" }}>↔ {p.driftCount}</span>}
                          {assignees.length > 0 && (
                            <span style={{ display: "inline-flex", gap: 2 }}>
                              {assignees.slice(0, 3).map((n: string, ai: number) => (
                                <span key={ai} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#f0f9ff", color: "#3b82f6", fontWeight: 500 }}>{n.split(" ")[0]}</span>
                              ))}
                              {assignees.length > 3 && <span style={{ fontSize: 10, color: "#94a3b8" }}>+{assignees.length - 3}</span>}
                            </span>
                          )}
                          {(p.unassignedCount || 0) > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#fff7ed", color: "#ea580c", fontWeight: 500 }}>👤 {p.unassignedCount}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {assigneeSummary.length > 0 && (
            <div style={sectionStyle}>
              <h2 style={sectionHeaderStyle}>👥 Загрузка команды ({assigneeSummary.length})</h2>
              <div style={{ padding: "0 20px 16px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Исполнитель</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Всего</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>✓</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>⚠</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>↗</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>📅</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assigneeSummary.map((a: any, i: number) => {
                      const pct = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
                      return (
                        <tr key={i}>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>{a.name}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>{a.total}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: "#10b981", fontWeight: a.completed > 0 ? 600 : 400 }}>{a.completed}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: a.overdue > 0 ? "#ef4444" : "#94a3b8", fontWeight: a.overdue > 0 ? 600 : 400 }}>{a.overdue}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: a.drift > 0 ? "#f59e0b" : "#94a3b8", fontWeight: a.drift > 0 ? 600 : 400 }}>{a.drift}</td>
                          <td style={{ ...tdStyle, textAlign: "center", color: (a.noDeadline || 0) > 0 ? "#8b5cf6" : "#94a3b8", fontWeight: (a.noDeadline || 0) > 0 ? 600 : 400 }}>{a.noDeadline || 0}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <div style={{ width: 40, height: 5, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: pct === 100 ? "#10b981" : "#3b82f6" }} />
                              </div>
                              <span style={{ fontSize: 11, color: "#64748b" }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
        )}

        {activeTab === "tasks" && (
          <>
            <Section icon="✅" title="Выполнено за период" tasks={completedTasks} />
            <Section icon="⚠️" title="Просрочено" tasks={overdueTasks} variant="danger" />
            <Section icon="📅" title="Дедлайны на неделе" tasks={weekTasks} />
            <Section icon="↔" title="Перенесённые сроки" tasks={driftTasks} extraHeader="Drift" variant="warning" />
            <Section icon="👤" title="Без ответственного" tasks={unassignedTasks} variant="warning" />
            <Section icon="📋" title="Ближайшие планы" tasks={upcomingTasks} />
            {[completedTasks, overdueTasks, weekTasks, driftTasks, unassignedTasks, upcomingTasks].every(a => a.length === 0) && (
              <div style={sectionStyle}><div style={{ padding: "12px 20px" }}><p style={{ color: "#94a3b8", fontSize: 13 }}>Нет задач за указанный период</p></div></div>
            )}
          </>
        )}

        {activeTab === "analysis" && (
          report.ai_summary ? (
            <div style={{ ...sectionStyle, background: "linear-gradient(135deg,#f0f9ff,#faf5ff)", borderColor: "#c7d2fe" }}>
              <h2 style={sectionHeaderStyle}>🤖 ИИ-анализ</h2>
              <div style={{ fontSize: 13, lineHeight: 1.8, color: "#334155", padding: "0 20px 16px" }}
                dangerouslySetInnerHTML={{ __html: report.ai_summary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- /gm, "• ") }} />
            </div>
          ) : (
            <div style={sectionStyle}><div style={{ padding: "12px 20px" }}><p style={{ color: "#94a3b8", fontSize: 13 }}>ИИ-анализ не был включён в этот отчёт</p></div></div>
          )
        )}

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 12, color: "#94a3b8" }}>Отчёт создан в JustTODOit · {dateStr}</div>
      </div>

      <button onClick={() => window.print()} style={{ position: "fixed", bottom: 20, right: 20, padding: "10px 18px", background: "linear-gradient(135deg,#3b82f6,#2563eb)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(59,130,246,.35)", zIndex: 100 }}>
        🖨️ Печать / PDF
      </button>
    </div>
  );
}

function Metric({ value, label, color, sub }: { value: any; label: string; color: string; sub?: any }) {
  return (
    <div style={{ background: "#fff", borderRight: "1px solid #f1f5f9", padding: "14px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#64748b", marginTop: 2, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, marginTop: 2, color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
}

const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".3px" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid #f1f5f9" };
const sectionStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 12, overflow: "hidden" };
const sectionHeaderStyle: React.CSSProperties = { fontSize: 15, fontWeight: 600, padding: "14px 20px", margin: 0, display: "flex", justifyContent: "space-between", alignItems: "center" };
