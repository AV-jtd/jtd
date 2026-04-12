import { ReportBlock } from "@/hooks/useReports";
import { useTaskGroups, useTasks } from "@/hooks/useTasks";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Tooltip,
  PieChart, Pie, LineChart, Line, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

const COLORS = ["#1D9E75", "#378ADD", "#F59E0B", "#E24B4A", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

interface ReportPreviewProps {
  title: string;
  blocks: ReportBlock[];
  coverColor?: string;
}

export default function ReportPreview({ title, blocks, coverColor }: ReportPreviewProps) {
  // Separate blocks by type for smart layout
  const kpiBlocks = blocks.filter(b => b.type === "kpi");
  const otherBlocks = blocks.filter(b => b.type !== "kpi");

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Интерактивный отчёт · {blocks.length} блоков
        </p>
      </div>

      {/* KPI Grid */}
      {kpiBlocks.length > 0 && (
        <div className={cn(
          "grid gap-3",
          kpiBlocks.length <= 2 ? "grid-cols-2" :
          kpiBlocks.length <= 4 ? "grid-cols-4" :
          "grid-cols-4"
        )}>
          {kpiBlocks.map(block => (
            <PreviewKpi key={block.id} data={block.data} />
          ))}
        </div>
      )}

      {/* Other blocks */}
      <div className="grid grid-cols-2 gap-4">
        {otherBlocks.map(block => (
          <div
            key={block.id}
            className={cn(
              block.width === "half" ? "col-span-1" : "col-span-2"
            )}
          >
            <PreviewBlock block={block} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewKpi({ data }: { data: Record<string, any> }) {
  const trendVal = data.trend || "";
  const isPositive = trendVal.startsWith("+");
  const isNegative = trendVal.startsWith("-") || trendVal.startsWith("−");

  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
        {data.label || "KPI"}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-medium tabular-nums" style={{ color: data.color || "hsl(var(--foreground))" }}>
          {data.value || "0"}
        </span>
        {data.suffix && <span className="text-sm text-muted-foreground">{data.suffix}</span>}
      </div>
      {trendVal && (
        <div className="mt-1.5">
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
            isPositive && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            isNegative && "bg-destructive/10 text-destructive",
            !isPositive && !isNegative && "bg-muted text-muted-foreground"
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> :
             isNegative ? <TrendingDown className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            {trendVal}
          </span>
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ block }: { block: ReportBlock }) {
  switch (block.type) {
    case "chart": return <PreviewChart data={block.data} />;
    case "text": return <PreviewText data={block.data} />;
    case "table": return <PreviewTable data={block.data} />;
    case "project_link": return <PreviewProjectLink data={block.data} />;
    case "divider": return <div className="border-t border-border/50 my-2 col-span-2" />;
    default: return null;
  }
}

function PreviewChart({ data }: { data: Record<string, any> }) {
  const chartData = data.data || [];
  const chartType = data.chartType || "bar";

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      {data.title && (
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {data.title}
        </div>
      )}
      <div className="flex gap-4 mb-3 flex-wrap">
        {chartData.slice(0, 6).map((item: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {item.name}
          </div>
        ))}
      </div>
      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : chartType === "line" ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2.5} dot={{ r: 4, fill: COLORS[0] }} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {chartData.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PreviewText({ data }: { data: Record<string, any> }) {
  const content = data.content || "";
  if (!content) return null;

  // Split by lines, detect **bold** markers
  const lines = content.split("\n");

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="space-y-2">
        {lines.map((line: string, i: number) => {
          if (!line.trim()) return <div key={i} className="h-2" />;

          // Bold header line
          if (line.startsWith("**") && line.endsWith("**")) {
            return (
              <div key={i} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {line.replace(/\*\*/g, "")}
              </div>
            );
          }

          // Bullet point
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                <span className="text-sm text-foreground leading-relaxed">{line.slice(2)}</span>
              </div>
            );
          }

          return <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>;
        })}
      </div>
    </div>
  );
}

function PreviewTable({ data }: { data: Record<string, any> }) {
  const columns: string[] = data.columns || [];
  const rows: string[][] = data.rows || [];

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      {data.title && (
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          {data.title}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="text-left font-medium text-muted-foreground text-[11px] px-3 py-2 border-b border-border/50">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/30 last:border-0">
                {row.map((cell, ci) => {
                  // Detect numeric values for styling
                  const num = parseFloat(cell);
                  const isPositive = cell.startsWith("+") || (cell.includes("%") && num > 0);
                  const isNegative = cell.startsWith("-") || cell.startsWith("−");

                  return (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-2 text-foreground",
                        ci === 0 && "font-medium",
                        ci > 0 && !isNaN(num) && "text-right tabular-nums",
                        isPositive && "text-emerald-600 dark:text-emerald-400 font-medium",
                        isNegative && "text-destructive font-medium"
                      )}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PreviewProjectLink({ data }: { data: Record<string, any> }) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const navigate = useNavigate();

  const project = groups.find(g => g.id === data.projectId);
  if (!project) return null;

  const projectTasks = allTasks.filter(t => t.group_id === data.projectId);
  const done = projectTasks.filter(t => t.is_completed).length;
  const pct = projectTasks.length > 0 ? Math.round((done / projectTasks.length) * 100) : 0;

  return (
    <button
      onClick={() => navigate(`/pmo/project/${project.id}`)}
      className="w-full rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4 hover:border-primary/40 hover:shadow-sm transition-all text-left group"
    >
      <div
        className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
        style={{ backgroundColor: project.color || "hsl(var(--primary))" }}
      >
        {project.icon && project.icon !== "list" ? project.icon : project.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{project.name}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center gap-3 mt-1.5">
          <div className="w-24 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: project.color || "hsl(var(--primary))" }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular-nums">{pct}% · {done}/{projectTasks.length} задач</span>
        </div>
        {data.note && <p className="text-xs text-muted-foreground mt-1.5">{data.note}</p>}
      </div>
    </button>
  );
}
