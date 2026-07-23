import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Boxes, Activity, TrendingUp, AlertTriangle, Rocket, Ban, ChevronDown, ChevronUp,
} from "lucide-react";
import type { KmAnalytics } from "../lib/kmAnalytics";

interface Props {
  analytics: KmAnalytics;
}

/** KPI tile. */
function Kpi({
  icon: Icon, label, value, tone = "default", onClick, active,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "success" | "destructive" | "warning";
  onClick?: () => void;
  active?: boolean;
}) {
  const toneText =
    tone === "primary" ? "text-primary"
    : tone === "success" ? "text-success"
    : tone === "destructive" ? "text-destructive"
    : tone === "warning" ? "text-warning"
    : "text-foreground";
  const ring =
    tone === "destructive" ? "border-destructive/30"
    : tone === "success" ? "border-success/30"
    : tone === "primary" ? "border-primary/30"
    : tone === "warning" ? "border-warning/30"
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

function KmDashboardBarInner({
  analytics,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("km:dashCollapsed") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("km:dashCollapsed", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  const a = analytics;

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
          <Kpi
            icon={Ban}
            label="Завис / блок"
            value={a.blockedSkus + a.stuckSkus}
            tone="warning"
          />
          <Kpi icon={Rocket} label="К запуску" value={a.readyToLaunch} tone="primary" />
        </div>
      )}
    </div>
  );
}

export const KmDashboardBar = React.memo(KmDashboardBarInner);
