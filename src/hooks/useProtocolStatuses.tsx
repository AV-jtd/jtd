import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type ProtocolStatusTag = {
  id: string;
  name: string;
  color: string | null;
  category_id: string | null;
};

/**
 * Возвращает теги из категории `protocol_status` (6 системных пресетов).
 * Если категория ещё не посеяна — пробует один раз вызвать seed-функцию.
 */
export function useProtocolStatuses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["protocol_statuses", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // 1) находим категорию
      let { data: cats, error: catErr } = await supabase
        .from("tag_categories")
        .select("id")
        .eq("system_key", "protocol_status")
        .limit(1);
      if (catErr) throw catErr;

      if (!cats || cats.length === 0) {
        // seed (idempotent)
        await supabase.rpc("seed_protocol_status_for_user" as any, {
          _user_id: user!.id,
        });
        const r = await supabase
          .from("tag_categories")
          .select("id")
          .eq("system_key", "protocol_status")
          .limit(1);
        cats = r.data ?? [];
      }

      if (!cats || cats.length === 0) return [];

      const { data: tags, error: tagsErr } = await supabase
        .from("tags")
        .select("id,name,color,category_id")
        .eq("category_id", cats[0].id);
      if (tagsErr) throw tagsErr;

      // Сохраняем порядок пресетов (по эмодзи-префиксу)
      const ORDER = ["🆕", "📤", "⏳", "✅", "🏁", "❌"];
      const sorted = (tags ?? []).slice().sort((a, b) => {
        const ai = ORDER.findIndex((p) => a.name.startsWith(p));
        const bi = ORDER.findIndex((p) => b.name.startsWith(p));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return sorted as ProtocolStatusTag[];
    },
  });
}

/**
 * Утилита: для задачи возвращает её текущий статус-тег (если назначен),
 * учитывая task_tags ↔ список статусов.
 */
export function useTaskStatusTag(taskTagIds: string[] | undefined) {
  const { data: statuses = [] } = useProtocolStatuses();
  return useMemo(() => {
    if (!taskTagIds?.length) return null;
    const ids = new Set(taskTagIds);
    return statuses.find((s) => ids.has(s.id)) ?? null;
  }, [statuses, taskTagIds]);
}
