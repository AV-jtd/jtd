import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DailyInsights {
  greeting: string;
  urgentItems: { emoji: string; text: string }[];
  focusOfDay: string;
  tips?: string[];
  motivation: string;
  stats: {
    active: number;
    overdue: number;
    dueThisWeek: number;
    completedRecently: number;
  };
}

const CACHE_KEY = "ai_insights_cache";
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

function getCached(): { insights: DailyInsights; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_DURATION_MS) return parsed;
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  return null;
}

function setCache(insights: DailyInsights) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ insights, ts: Date.now() }));
}

export function useAiInsights() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DailyInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchInsights = useCallback(async (force = false) => {
    if (!user) return;

    // Check cache first
    if (!force) {
      const cached = getCached();
      if (cached) {
        setInsights(cached.insights);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-insights");

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
        setCache(data.insights);
      }
    } catch (e: any) {
      console.error("AI insights error:", e);
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !insights && !loading) {
      fetchInsights();
    }
  }, [user]);

  const refresh = useCallback(() => {
    setDismissed(false);
    fetchInsights(true);
  }, [fetchInsights]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return { insights, loading, error, dismissed, refresh, dismiss };
}
