import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProtocolsInsight {
  generatedAt: string;
  totals: {
    protocols: number;
    active: number;
    stuck: number;
    closedThisWeek: number;
    createdThisWeek: number;
  };
  axes: Array<{
    axisKey: string;
    axisLabel: string;
    chips: Array<{ tagId: string; tagName: string; stuckCount: number }>;
  }>;
  comment: string;
}

const CACHE_KEY = "protocols_insight_cache_v1";
const TTL_MS = 2 * 60 * 60 * 1000; // 2h

function readCache(): { insight: ProtocolsInsight; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts < TTL_MS) return parsed;
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  return null;
}
function writeCache(insight: ProtocolsInsight) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ insight, ts: Date.now() }));
}

export function useProtocolsInsight() {
  const { user } = useAuth();
  const [insight, setInsight] = useState<ProtocolsInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const fetchInsight = useCallback(async (force = false) => {
    if (!user) return;
    if (!force) {
      const c = readCache();
      if (c) {
        setInsight(c.insight);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("protocols-insights", {});
      if (fnErr) throw fnErr;
      if (data?.insight) {
        setInsight(data.insight);
        writeCache(data.insight);
      } else {
        setInsight(null);
      }
    } catch (e: any) {
      console.error("protocols-insights error:", e);
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !insight && !loading) fetchInsight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    insight,
    loading,
    error,
    dismissed,
    refresh: () => { setDismissed(false); fetchInsight(true); },
    dismiss: () => setDismissed(true),
  };
}
