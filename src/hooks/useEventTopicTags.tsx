import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTagCategories } from "./useTasks";

/**
 * Тег категории `event_topic` = «Тема» в протоколе.
 * Важно: темы должны быть видны всем участникам протокола, а не только их создателю,
 * поэтому читаем ВСЕ доступные пользователю event_topic-теги через RLS,
 * а не только теги с user_id текущего пользователя.
 */
export function useEventTopicTags() {
  const { user } = useAuth();
  const { data: categories = [] } = useTagCategories();

  const categoryId = useMemo(
    () =>
      categories.find(
        (c: any) => c.system_key === "event_topic" && c.user_id === user?.id,
      )?.id ?? null,
    [categories, user?.id],
  );

  const { data: topicTags = [] } = useQuery({
    queryKey: ["event_topic_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color, category_id, tag_categories!inner(system_key)")
        .eq("tag_categories.system_key", "event_topic")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(({ tag_categories, ...tag }: any) => tag);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    refetchOnReconnect: "always",
  });

  return { categoryId, topicTags };
}

/**
 * Создание новой темы (тега в категории event_topic).
 * Если системная категория у пользователя ещё не создана, создаём её лениво.
 */
export function useCreateEventTopic() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (
      name: string,
    ): Promise<{ id: string; name: string; linkedGroupId?: string | null } | null> => {
      const trimmed = name.trim();
      if (!trimmed || !user) return null;

      let category = (
        await supabase
          .from("tag_categories" as any)
          .select("id")
          .eq("system_key", "event_topic")
          .eq("user_id", user.id)
          .maybeSingle()
      ).data as unknown as { id: string } | null;

      if (!category) {
        const { data: createdCategory, error: categoryError } = await supabase
          .from("tag_categories" as any)
          .insert({
            name: "Тема",
            system_key: "event_topic",
            is_system: true,
            user_id: user.id,
          })
          .select("id")
          .single();

        if (categoryError) throw categoryError;
        category = createdCategory as unknown as { id: string } | null;
      }

      const categoryId = category?.id;
      if (!categoryId) throw new Error("Не удалось определить категорию «Тема»");

      // Look for existing tag (case-insensitive)
      const { data: existing } = await supabase
        .from("tags")
        .select("id, name")
        .eq("category_id", categoryId)
        .eq("user_id", user.id)
        .ilike("name", trimmed)
        .maybeSingle();

      let tagRow: { id: string; name: string } | null = (existing as any) ?? null;

      if (!tagRow) {
        const { data, error } = await supabase
          .from("tags")
          .insert({
            name: trimmed,
            category_id: categoryId,
            user_id: user.id,
            color: "hsl(var(--primary))",
          })
          .select("id, name")
          .single();
        if (error) throw error;
        tagRow = data as any;
      }

      if (!tagRow) return null;

      // Auto-link to an existing project (task_group) with the same name (case-insensitive).
      // Look across ALL accessible groups (RLS filters to owned + member), not only own.
      let linkedGroupId: string | null = null;
      try {
        const { data: matchingGroups } = await supabase
          .from("task_groups")
          .select("id, linked_tag_id, user_id")
          .ilike("name", trimmed)
          .is("closed_at", null);

        const candidates = matchingGroups ?? [];
        // Prefer: already linked to this tag → user's own group → any accessible.
        const matchingGroup =
          candidates.find((g) => g.linked_tag_id === tagRow!.id) ??
          candidates.find((g) => g.user_id === user.id) ??
          candidates[0] ??
          null;

        if (matchingGroup?.id) {
          linkedGroupId = matchingGroup.id;
          if (!matchingGroup.linked_tag_id && matchingGroup.user_id === user.id) {
            // Only the owner can update linked_tag_id under RLS.
            await supabase
              .from("task_groups")
              .update({ linked_tag_id: tagRow.id })
              .eq("id", matchingGroup.id);
          }
        }
      } catch {
        // Linking is best-effort.
      }

      return { ...tagRow, linkedGroupId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["tag_categories"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["event_topic_tags"] });
    },
  });
}
