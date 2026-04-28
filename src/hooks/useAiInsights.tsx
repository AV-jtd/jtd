import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InsightItem {
  emoji: string;
  text: string;
  task_id?: string;
  group_id?: string;
  /** Hint for smart filtering: what kind of issue this insight is about */
  hint?: "overdue" | "no_deadline" | "no_assignee" | "steps" | "stale" | "drift" | "blocked";
}

export interface DailyInsights {
  greeting: string;
  urgentItems: InsightItem[];
  focusOfDay: string;
  focusTaskId?: string;
  focusGroupId?: string;
  tips?: string[];
  motivation: string;
  stats: {
    active: number;
    overdue: number;
    dueThisWeek: number;
    completedRecently: number;
  };
}

const CACHE_KEY = "ai_insights_cache_v2";
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
const AI_INSIGHTS_TIMEOUT_MS = 15_000;

async function invokeInsights(projectId?: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      supabase.functions.invoke("ai-insights", {
        body: projectId ? { projectId } : undefined,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("AI insights request timed out")),
          AI_INSIGHTS_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getCacheKey(projectId?: string) {
  return projectId ? `${CACHE_KEY}_project_${projectId}` : CACHE_KEY;
}

function getCached(projectId?: string): { insights: DailyInsights; ts: number } | null {
  try {
    const raw = localStorage.getItem(getCacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_DURATION_MS) return parsed;
    localStorage.removeItem(getCacheKey(projectId));
  } catch { /* ignore */ }
  return null;
}

function setCache(insights: DailyInsights, projectId?: string) {
  localStorage.setItem(getCacheKey(projectId), JSON.stringify({ insights, ts: Date.now() }));
}

export function useAiInsights(projectId?: string) {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchInsights = useCallback(async (force = false) => {
    if (!user) return;

    // Check cache first
    if (!force) {
      const cached = getCached(projectId);
      if (cached) {
        setInsights(cached.insights);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await invokeInsights(projectId);

      if (fnError) {
        const errBody = typeof fnError === "object" ? fnError : {};
        if ((errBody as any)?.status === 429) {
          setError("rate_limited");
          return;
        }
        throw fnError;
      }

      if (data?.insights) {
        setInsights(data.insights);
        setCache(data.insights, projectId);
      }
    } catch (e: any) {
      console.error("AI insights error:", e);
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }, [user, projectId]);

  useEffect(() => {
    if (user && !insights && !loading) {
      fetchInsights();
    }
  }, [user, projectId]);

  const refresh = useCallback(() => {
    setDismissed(false);
    fetchInsights(true);
  }, [fetchInsights]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return { insights, loading, error, dismissed, refresh, dismiss };
}
