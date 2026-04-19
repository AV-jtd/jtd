import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTags, useTagCategories } from "./useTasks";

/**
 * Тег категории `event_topic` = «Тема вопроса» в протоколе.
 * Возвращает только теги пользователя из системной категории event_topic.
 */
export function useEventTopicTags() {
  const { user } = useAuth();
  const { data: tags = [] } = useTags();
  const { data: categories = [] } = useTagCategories();

  const categoryId = useMemo(
    () =>
      categories.find(
        (c: any) => c.system_key === "event_topic" && c.user_id === user?.id,
      )?.id ?? null,
    [categories, user?.id],
  );

  const topicTags = useMemo(
    () =>
      tags.filter(
        (t) => t.category_id === categoryId && t.user_id === user?.id,
      ),
    [tags, categoryId, user?.id],
  );

  return { categoryId, topicTags };
}

/**
 * Создание новой темы (тега в категории event_topic).
 */
export function useCreateEventTopic() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { categoryId } = useEventTopicTags();

  return useMutation({
    mutationFn: async (name: string): Promise<{ id: string; name: string } | null> => {
      const trimmed = name.trim();
      if (!trimmed || !user || !categoryId) return null;

      // Проверка дублей (case-insensitive)
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
          color: "#10b981",
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
