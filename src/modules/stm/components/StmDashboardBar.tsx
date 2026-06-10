import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Boxes, Activity, TrendingUp, AlertTriangle, Rocket, ChevronDown, ChevronUp,
} from "lucide-react";
import type { StmAnalytics } from "../lib/stmAnalytics";

interface Props {
  analytics: StmAnalytics;
  focusStage: string | null;
  onFocusStage: (stageKey: string | null) => void;
  onPickGroup: (term: string) => void;
  groupMode: "retailer" | "brand";
}

/** KPI tile. */
function Kpi({
  icon: Icon, label, value, tone = "default", onClick, active,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "success" | "destructive";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneText =
    tone === "primary" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : "text-foreground";
  const ring =
    tone === "destructive" ? "border-destructive/30"
    : tone === "success" ? "border-success/30"
    : tone === "primary" ? "border-primary/30"
    : "border-border";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex-1 min-w-[120px] flex flex-col gap-1 rounded-lg border bg-card px-3 py-2 text-left transition-colors",
        ring,
        onClick && "hover:bg-muted/50 cursor-pointer",
        active && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("text-xl font-bold tabular-nums leading-none", toneText)}>{value}</div>
    </button>
  );
}

function StmDashboardBarInner({
  analytics, focusStage, onFocusStage, onPickGroup, groupMode,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("stm:dashCollapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("stm:dashCollapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  const a = analytics;
  const maxBucket = Math.max(1, ...a.stageBuckets.map(b => b.count));
  const groups = (groupMode === "brand" ? a.byBrand : a.byRetailer)
    .filter(g => g.key !== "Без группы")
    .slice(0, 5);
  const maxGroup = Math.max(1, ...groups.map(g => g.count));

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Сводка по портфелю
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          {collapsed ? "Показать" : "Свернуть"}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-3">
          {/* KPI tiles */}
          <div className="flex flex-wrap gap-2">
            <Kpi icon={Boxes} label="Всего SKU" value={a.total} />
            <Kpi icon={Activity} label="В работе" value={a.total - a.completed - a.notStarted} tone="primary" />
            <Kpi icon={TrendingUp} label="Ср. прогресс" value={`${a.avgProgress}%`} tone="success" />
            <Kpi
              icon={AlertTriangle}
              label="Просрочено"
              value={a.overdueSkus}
              tone="destructive"
            />
            <Kpi icon={Rocket} label="К запуску" value={a.readyToLaunch} tone="primary" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Stage funnel */}
            <div className="lg:col-span-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Распределение по текущему этапу
                </span>
                {focusStage && (
                  <button
                    type="button"
                    onClick={() => onFocusStage(null)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Сбросить фильтр
                  </button>
                )}
              </div>
              <div className="flex items-end gap-1 h-20">
                {a.stageBuckets.map(b => {
                  const active = focusStage === b.stage.key;
                  const h = b.count ? Math.max(8, (b.count / maxBucket) * 100) : 3;
                  const isMs = !!b.stage.milestoneKey;
                  return (
                    <button
                      key={b.stage.key}
                      type="button"
                      onClick={() => onFocusStage(active ? null : b.stage.key)}
                      title={`${b.stage.title}: ${b.count} SKU`}
                      className="flex-1 flex flex-col items-center justify-end gap-1 group h-full"
                    >
                      <span className={cn(
                        "text-[10px] font-bold tabular-nums leading-none",
                        b.count ? "text-foreground" : "text-muted-foreground/40",
                      )}>
                        {b.count || ""}
                      </span>
                      <div
                        style={{ height: `${h}%` }}
                        className={cn(
                          "w-full rounded-t transition-all",
                          active
                            ? "bg-primary"
                            : isMs
                              ? "bg-primary/40 group-hover:bg-primary/60"
                              : "bg-primary/20 group-hover:bg-primary/40",
                        )}
                      />
                      <span className={cn(
                        "text-[8px] uppercase tracking-tight leading-none truncate w-full text-center",
                        active ? "text-primary font-semibold" : "text-muted-foreground/70",
                      )}>
                        {b.stage.short}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group breakdown */}
            <div className="rounded-lg border border-border bg-card p-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                {groupMode === "brand" ? "Топ брендов" : "Топ сетей"}
              </span>
              <div className="flex flex-col gap-1.5">
                {groups.length === 0 && (
                  <span className="text-[11px] text-muted-foreground/60 italic">Нет данных</span>
                )}
                {groups.map(g => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => onPickGroup(g.key)}
                    className="flex items-center gap-2 text-left group"
                    title={`${g.key}: ${g.count} SKU · ${g.avgProgress}%`}
                  >
                    <span className="text-[11px] text-foreground/80 truncate w-24 group-hover:text-primary transition-colors">
                      {g.key}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${Math.max(6, (g.count / maxGroup) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground w-6 text-right">{g.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const StmDashboardBar = React.memo(StmDashboardBarInner);