import { supabase } from "@/integrations/supabase/client";

/**
 * Living-protocol seed: ensures a placeholder topic ("Общее") exists for a
 * freshly created living protocol, and registers an empty notes entry under
 * `protocol_meta.topic_notes[tagId]` so the editor renders the topic block
 * immediately. Best-effort — caller should not block UX on failure.
 */
/**
 * Living-protocol seed.
 *
 * If `existingTagId` is provided (e.g. user picked a "Серия / Тема" filter when
 * creating the protocol), reuse that tag and link it to the protocol — so the
 * topic carries over from the chosen series. Otherwise create / reuse the
 * default "Общее" placeholder.
 */
export async function seedLivingPlaceholder(
  userId: string,
  groupId: string,
  existingTagId?: string | null,
): Promise<void> {
  const placeholderName = "Общее";

  // Fast-path: caller already knows which topic tag to attach.
  if (existingTagId) {
    // Link the tag to the protocol's "first task" placeholder via protocol_meta only —
    // there are no task rows yet at creation time. The topic chip in the UI is rendered
    // from `protocol_meta.topic_notes` keys, so registering the tag there is enough.
    const { data: group } = await supabase
      .from("task_groups")
      .select("protocol_meta")
      .eq("id", groupId)
      .maybeSingle();
    const meta: any = (group as any)?.protocol_meta ?? {};
    const notes = { ...(meta.topic_notes ?? {}) };
    if (!notes[existingTagId]) notes[existingTagId] = "";
    await supabase
      .from("task_groups")
      .update({ protocol_meta: { ...meta, topic_notes: notes } } as any)
      .eq("id", groupId);
    return;
  }

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