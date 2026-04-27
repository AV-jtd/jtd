import { supabase } from "@/integrations/supabase/client";

/**
 * Living-protocol seed: ensures a placeholder topic ("Общее") exists for a
 * freshly created living protocol, and registers an empty notes entry under
 * `protocol_meta.topic_notes[tagId]` so the editor renders the topic block
 * immediately. Best-effort — caller should not block UX on failure.
 */
export async function seedLivingPlaceholder(userId: string, groupId: string): Promise<void> {
  const placeholderName = "Общее";

  // 1. Find or create user's `event_topic` category.
  let category = (
    await supabase
      .from("tag_categories" as any)
      .select("id")
      .eq("system_key", "event_topic")
      .eq("user_id", userId)
      .maybeSingle()
  ).data as unknown as { id: string } | null;

  if (!category) {
    const { data: created, error: catErr } = await supabase
      .from("tag_categories" as any)
      .insert({
        name: "Тема",
        system_key: "event_topic",
        is_system: true,
        user_id: userId,
      })
      .select("id")
      .single();
    if (catErr) throw catErr;
    category = created as unknown as { id: string };
  }
  const categoryId = category!.id;

  // 2. Find or create the placeholder tag (case-insensitive).
  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("category_id", categoryId)
    .eq("user_id", userId)
    .ilike("name", placeholderName)
    .maybeSingle();

  let tagId: string | null = (existing as any)?.id ?? null;
  if (!tagId) {
    const { data: tagRow, error: tagErr } = await supabase
      .from("tags")
      .insert({
        name: placeholderName,
        category_id: categoryId,
        user_id: userId,
        color: "hsl(var(--primary))",
      })
      .select("id")
      .single();
    if (tagErr) throw tagErr;
    tagId = (tagRow as any).id;
  }

  // 3. Patch protocol_meta with topic_notes placeholder (preserve existing meta).
  const { data: group } = await supabase
    .from("task_groups")
    .select("protocol_meta")
    .eq("id", groupId)
    .maybeSingle();
  const meta: any = (group as any)?.protocol_meta ?? {};
  const notes = { ...(meta.topic_notes ?? {}) };
  if (!notes[tagId!]) notes[tagId!] = "";
  await supabase
    .from("task_groups")
    .update({ protocol_meta: { ...meta, topic_notes: notes } } as any)
    .eq("id", groupId);
}