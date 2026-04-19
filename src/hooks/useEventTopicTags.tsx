import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTags, useTagCategories } from "./useTasks";

/**
 * Тег категории `event_topic` = «Тема» в протоколе.
 * Важно: темы должны быть видны всем участникам протокола, а не только их создателю,
 * поэтому возвращаем все доступные event_topic-теги, которые пользователь может читать.
 */
export function useEventTopicTags() {
  const { user } = useAuth();
  const { data: tags = [] } = useTags();
  const { data: categories = [] } = useTagCategories();

  const eventTopicCategoryIds = useMemo(
    () =>
      new Set(
        categories
          .filter((c: any) => c.system_key === "event_topic")
          .map((c: any) => c.id),
      ),
    [categories],
  );

  const categoryId = useMemo(
    () =>
      categories.find(
        (c: any) => c.system_key === "event_topic" && c.user_id === user?.id,
      )?.id ?? null,
    [categories, user?.id],
  );

  const topicTags = useMemo(
    () => tags.filter((t) => !!t.category_id && eventTopicCategoryIds.has(t.category_id)),
    [tags, eventTopicCategoryIds],
  );

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
    },
  });
}
