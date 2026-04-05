import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Persist a JSON setting per user across devices via user_settings table.
 * Falls back to localStorage for instant load & offline resilience.
 */
export function useUserSetting<T>(key: string, defaultValue: T) {
  const { user } = useAuth();
  const lsKey = `user_setting_${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(lsKey);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const [loaded, setLoaded] = useState(false);

  // Load from DB on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("setting_value")
        .eq("user_id", user.id)
        .eq("setting_key", key)
        .maybeSingle();
      if (cancelled) return;
      if (data?.setting_value != null) {
        const parsed = data.setting_value as T;
        setValue(parsed);
        localStorage.setItem(lsKey, JSON.stringify(parsed));
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user, key, lsKey]);

  const update = useCallback(
    (newValue: T) => {
      setValue(newValue);
      localStorage.setItem(lsKey, JSON.stringify(newValue));
      if (!user) return;
      supabase
        .from("user_settings")
        .upsert(
          { user_id: user.id, setting_key: key, setting_value: newValue as any, updated_at: new Date().toISOString() },
          { onConflict: "user_id,setting_key" }
        )
        .then();
    },
    [user, key, lsKey],
  );

  return [value, update, loaded] as const;
}
