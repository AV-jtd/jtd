import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const PROTOCOL_AXIS_KEYS = [
  "clients",
  "brand",
  "product_category",
  "site",
  "territory",
  "event_topic",
] as const;
export type ProtocolAxisKey = (typeof PROTOCOL_AXIS_KEYS)[number];

export const AXIS_LABELS: Record<ProtocolAxisKey, string> = {
  clients: "Клиент",
  brand: "Бренд",
  product_category: "Категория",
  site: "Площадка",
  territory: "Территория",
  event_topic: "Тема",
};

export interface AxisChip {
  tagId: string;
  tagName: string;
  tagColor: string | null;
  protocolIds: string[];
  taskCount: number;
}

export interface AxisGroup {
  key: ProtocolAxisKey;
  label: string;
  chips: AxisChip[];
}

interface Args {
  protocolIds: string[];
  enabled?: boolean;
}

export function useProtocolsAxes({ protocolIds, enabled = true }: Args) {
  const { user } = useAuth();
  const ids = useMemo(() => Array.from(new Set(protocolIds)).sort(), [protocolIds]);
  const idsKey = ids.join(",");

  return useQuery({
    queryKey: ["protocols-axes", user?.id, idsKey],
    enabled: !!user?.id && enabled && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<AxisGroup[]> => {
      const { data: gtRows, error } = await supabase
        .from("group_tags")
        .select(
          "group_id, tag_id, tags!inner(id, name, color, category_id, tag_categories!inner(system_key, is_system))",
        )
        .in("group_id", ids);
      if (error) throw error;

      const byTag = new Map<
        string,
        { axis: ProtocolAxisKey; name: string; color: string | null; protocols: Set<string> }
      >();
      for (const r of (gtRows ?? []) as any[]) {
        const cat = r.tags?.tag_categories;
        if (!cat?.is_system) continue;
        const key = cat.system_key as string;
        if (!PROTOCOL_AXIS_KEYS.includes(key as ProtocolAxisKey)) continue;
        const existing = byTag.get(r.tag_id);
        if (existing) {
          existing.protocols.add(r.group_id);
        } else {
          byTag.set(r.tag_id, {
            axis: key as ProtocolAxisKey,
            name: r.tags.name,
            color: r.tags.color ?? null,
            protocols: new Set([r.group_id]),
          });
        }
      }

      const tagIds = Array.from(byTag.keys());
      const countsByTag = new Map<string, number>();
      if (tagIds.length > 0) {
        const { data: ttRows, error: ttErr } = await supabase
          .from("task_tags")
          .select("tag_id, tasks!inner(id, group_id)")
          .in("tag_id", tagIds)
          .in("tasks.group_id", ids);
        if (ttErr) throw ttErr;
        for (const r of (ttRows ?? []) as any[]) {
          countsByTag.set(r.tag_id, (countsByTag.get(r.tag_id) ?? 0) + 1);
        }
      }

      const groups: Record<ProtocolAxisKey, AxisChip[]> = {
        clients: [], brand: [], product_category: [], site: [], territory: [], event_topic: [],
      };
      byTag.forEach((v, tagId) => {
        groups[v.axis].push({
          tagId,
          tagName: v.name,
          tagColor: v.color,
          protocolIds: Array.from(v.protocols),
          taskCount: countsByTag.get(tagId) ?? 0,
        });
      });

      return PROTOCOL_AXIS_KEYS
        .map((key) => ({
          key,
          label: AXIS_LABELS[key],
          chips: groups[key].sort(
            (a, b) => b.taskCount - a.taskCount || a.tagName.localeCompare(b.tagName),
          ),
        }))
        .filter((g) => g.chips.length > 0);
    },
  });
}
