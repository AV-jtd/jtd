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
    mutationFn: async (name: string): Promise<{ id: string; name: string } | null> => {
      const trimmed = name.trim();
      if (!trimmed || !user) return null;

      let category = (
        await supabase
          .from("tag_categories" as any)
          .select("id")
          .eq("system_key", "event_topic")
          .eq("user_id", user.id)
          .maybeSingle()
      ).data as { id: string } | null;

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
        category = createdCategory as { id: string } | null;
      }

      const categoryId = category?.id;
      if (!categoryId) throw new Error("Не удалось определить категорию «Тема»");

      const { data: existing } = await supabase
        .from("tags")
        .select("id, name")
        .eq("category_id", categoryId)
        .eq("user_id", user.id)
        .ilike("name", trimmed)
        .maybeSingle();
      if (existing) return existing as any;

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
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["tag_categories"] });
    },
  });
}
