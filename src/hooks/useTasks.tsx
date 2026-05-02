import { useQuery, useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import { useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Tables, TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";

export type Task = Tables<"tasks"> & {
  subtasks?: Tables<"subtasks">[];
  task_tags?: { tag_id: string }[];
  tags?: Tables<"tags">[];
  recurrence?: string | null;
  recurrence_end_date?: string | null;
  parent_recurring_id?: string | null;
  priority?: number | null;
  original_deadline?: string | null;
  deferred_until?: string | null;
};
export type TaskGroup = Tables<"task_groups"> & { linked_tag_id?: string | null; parent_id?: string | null; closed_at?: string | null; baseline_status?: string; baseline_approver_id?: string | null; baseline_locked_at?: string | null; baseline_auto_lock_hours?: number };
export type Tag = Tables<"tags"> & { category_id?: string | null };
export type Subtask = Tables<"subtasks">;
export type TaskParticipant = { id: string; task_id: string; user_id: string; role: string; created_at: string };
export type Profile = { id: string; display_name: string | null; email: string | null; telegram_username: string | null; username: string | null };
export type ProjectFolder = { id: string; user_id: string; name: string; color: string | null; icon: string | null; position: number; created_at: string };
export type ProjectFolderItem = { id: string; folder_id: string; group_id: string; user_id: string; position: number; created_at: string };
export type TagCategory = { id: string; name: string; color: string | null; position: number; user_id: string; created_at: string; parent_id?: string | null };

// --- Optimistic update helpers ---

function updateAllTaskCaches(qc: QueryClient, updater: (tasks: Task[]) => Task[]) {
  qc.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (old) => old ? updater(old) : old);
}

function updateAllGroupCaches(qc: QueryClient, updater: (groups: TaskGroup[]) => TaskGroup[]) {
  qc.setQueriesData<TaskGroup[]>({ queryKey: ["task_groups"] }, (old) => old ? updater(old) : old);
}

function snapshotTasks(qc: QueryClient) {
  const cache: [readonly unknown[], Task[] | undefined][] = [];
  qc.getQueriesData<Task[]>({ queryKey: ["tasks"] }).forEach(([key, data]) => {
    cache.push([key, data]);
  });
  return cache;
}

function restoreTasks(qc: QueryClient, snapshot: [readonly unknown[], Task[] | undefined][]) {
  snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
}

function snapshotGroups(qc: QueryClient) {
  const cache: [readonly unknown[], TaskGroup[] | undefined][] = [];
  qc.getQueriesData<TaskGroup[]>({ queryKey: ["task_groups"] }).forEach(([key, data]) => {
    cache.push([key, data]);
  });
  return cache;
}

function restoreGroups(qc: QueryClient, snapshot: [readonly unknown[], TaskGroup[] | undefined][]) {
  snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
}

function tempId() {
  return `temp-${crypto.randomUUID()}`;
}

// --- Duplicate name check helper ---

export class DuplicateNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateNameError";
  }
}

// Keep task pages small: the first pass intentionally loads task rows only.
// Relations (steps/tags) hydrate in the background so tabs can paint quickly
// instead of waiting for nested RLS checks on subtasks/task_tags.
const SUPABASE_PAGE_SIZE = 100;
const SUPABASE_PAGE_TIMEOUT_MS = 30_000;
const TASK_RELATION_BATCH_SIZE = 100;
const TASK_BOOT_MAX_PAGES = 20;
const taskRelationHydrationInFlight = new Set<string>();

async function withSupabaseTimeout<T>(request: PromiseLike<T>, label: string, timeoutMs = SUPABASE_PAGE_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxPages = 100,
) {
  const all: T[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await withSupabaseTimeout(fetchPage(from, to), `Data page ${page + 1}`);
    if (error) throw error;

    const chunk = data || [];
    // Defensive dedup: non-unique ORDER BY columns (e.g. `position`) combined
    // with `.range()` pagination can cause Postgres to return overlapping
    // rows across pages — which surfaced as duplicate project cards in
    // /pmo (same project rendered 2-3 times). Skip rows we've already seen.
    for (const row of chunk) {
      const id = (row as unknown as { id?: string }).id;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      all.push(row);
    }

    if (chunk.length < SUPABASE_PAGE_SIZE) break;
  }

  return all;
}

/**
 * Streaming variant of fetchAllPages.
 *
 * Calls `onPage(accumulated)` after EACH page lands so the caller can push
 * intermediate results into React Query's cache via `setQueryData`. The
 * UI re-renders as soon as the first page (1000 rows) arrives — the rest
 * stream in over the next 1-3 seconds without blocking the first paint.
 *
 * Why this matters: on accounts with 1500-2000 globally-visible tasks, the
 * old `fetchAllPages` blocked the first paint until ALL 2-3 pages landed
 * (~5-8MB JSON over 4-6 seconds on slow networks). With streaming the user
 * sees the list in ~half the time, and the late pages just append silently.
 *
 * The returned promise still resolves with the FULL accumulated array so
 * post-processing (filtering, tag expansion) sees complete data.
 */
async function fetchAllPagesStreaming<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  onPage: (accumulated: T[], isFinal: boolean) => void,
  maxPages = 100,
  shouldStop?: (accumulated: T[]) => boolean,
) {
  const all: T[] = [];
  const seenIds = new Set<string>();

  for (let page = 0; page < maxPages; page++) {
    const from = page * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await withSupabaseTimeout(fetchPage(from, to), `Tasks page ${page + 1}`);
    if (error) throw error;

    const chunk = data || [];
    // Defensive dedup: non-unique ORDER BY columns (e.g. position) combined
    // with .range() pagination can cause Postgres to return overlapping rows
    // across pages. Always keep an id-set to prevent x2/x3 duplicates.
    for (const row of chunk) {
      const id = (row as unknown as { id?: string }).id;
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      all.push(row);
    }

    const isFinal = chunk.length < SUPABASE_PAGE_SIZE;
    // Hand the running total to the caller. The caller decides whether to
    // publish it (e.g. only for global lists, not per-group queries where
    // the first page is almost always the only page).
    onPage(all, isFinal);

    if (isFinal) break;
    if (shouldStop && shouldStop(all)) break;
  }

  return all;
}

function waitForIdle(timeout = 600) {
  return new Promise<void>((resolve) => {
    const ric = typeof window !== "undefined" &&
      (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => resolve(), { timeout });
    else window.setTimeout(resolve, 0);
  });
}

async function hydrateTaskRelationsInBackground(
  qc: QueryClient,
  queryKey: readonly unknown[],
  tasks: Task[],
) {
  const ids = [...new Set(tasks.map((t) => t.id))];
  if (ids.length === 0) return;

  const hydrationKey = JSON.stringify(queryKey);
  if (taskRelationHydrationInFlight.has(hydrationKey)) return;
  taskRelationHydrationInFlight.add(hydrationKey);

  try {
    const subtasksByTask = new Map<string, Subtask[]>();
    const tagsByTask = new Map<string, { tag_id: string }[]>();

    for (let i = 0; i < ids.length; i += TASK_RELATION_BATCH_SIZE) {
      if (typeof document !== "undefined" && document.hidden) break;
      await waitForIdle();

      const chunk = ids.slice(i, i + TASK_RELATION_BATCH_SIZE);
      const [subtasksRes, tagsRes] = await Promise.all([
        supabase
          .from("subtasks")
          .select("*")
          .in("task_id", chunk)
          .order("position"),
        supabase
          .from("task_tags")
          .select("task_id, tag_id")
          .in("task_id", chunk),
      ]);

      if (subtasksRes.error || tagsRes.error) {
        console.warn("[Tasks] relation hydration skipped", subtasksRes.error || tagsRes.error);
        return;
      }

      for (const subtask of (subtasksRes.data || []) as Subtask[]) {
        const list = subtasksByTask.get(subtask.task_id) || [];
        list.push(subtask);
        subtasksByTask.set(subtask.task_id, list);
      }

      for (const row of (tagsRes.data || []) as { task_id: string; tag_id: string }[]) {
        const list = tagsByTask.get(row.task_id) || [];
        list.push({ tag_id: row.tag_id });
        tagsByTask.set(row.task_id, list);
      }
    }

    qc.setQueryData<Task[]>(queryKey, (current) =>
      current?.map((task) => ({
        ...task,
        subtasks: subtasksByTask.get(task.id) || task.subtasks || [],
        task_tags: tagsByTask.get(task.id) || task.task_tags || [],
      })),
    );
  } finally {
    taskRelationHydrationInFlight.delete(hydrationKey);
  }
}

/**
 * Check if a name already exists across tags, projects, or tasks.
 * Throws DuplicateNameError if duplicate found.
 * @param name - Name to check
 * @param entity - What we're creating/renaming ('tag' | 'project' | 'task')
 * @param excludeId - ID to exclude (for rename operations)
 * @param userId - Current user ID for scoping
 */
async function checkDuplicateName(
  name: string,
  entity: "tag" | "project" | "task",
  userId: string,
  excludeId?: string
) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return;

  // Check projects
  const { data: groups } = await supabase
    .from("task_groups")
    .select("id, name, linked_tag_id");
  const dupGroup = (groups || []).find(
    (g) => g.name.trim().toLowerCase() === normalized && g.id !== excludeId
  );
  if (dupGroup) {
    if (entity === "project") {
      throw new DuplicateNameError(`Проект «${dupGroup.name}» уже существует`);
    }
    throw new DuplicateNameError(`Название «${name.trim()}» уже используется проектом «${dupGroup.name}»`);
  }

  // Collect linked tag IDs (these are auto-created for projects, skip them in tag-vs-tag check)
  const linkedTagIds = new Set((groups || []).map((g) => g.linked_tag_id).filter(Boolean));

  // Check tags (exclude linked tags for project creation since project auto-creates a linked tag)
  const { data: tags } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", userId);
  const dupTag = (tags || []).find((t) => {
    if (t.name.trim().toLowerCase() !== normalized) return false;
    if (t.id === excludeId) return false;
    // When creating a project, skip tags that are linked to projects (they share names by design)
    if (entity === "project" && linkedTagIds.has(t.id)) return false;
    return true;
  });
  if (dupTag) {
    if (entity === "tag") {
      throw new DuplicateNameError(`Тэг «${dupTag.name}» уже существует`);
    }
    // For "project" entity we INTENTIONALLY do not throw: a user creating a
    // project that matches an existing free-standing tag usually wants to
    // promote that tag into a project (collect tagged tasks under one umbrella).
    // The addGroup mutation reuses the existing tag as linked_tag_id, so the
    // task-hierarchy filter automatically pulls everything tagged with it.
    if (entity === "project") return;
    throw new DuplicateNameError(`Название «${name.trim()}» уже используется тэгом «${dupTag.name}»`);
  }
}

// --- Query hooks ---

export function useTaskGroups() {
  const { user, loading } = useAuth();

  // Realtime subscription moved to useRealtimeSubscriptions (singleton at App root)

  return useQuery({
    queryKey: ["task_groups", user?.id],
    queryFn: async () => {
      const data = await fetchAllPages<TaskGroup>((from, to) =>
        supabase
          .from("task_groups")
          .select("*")
          .order("position")
          .range(from, to)
      );
      return data;
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    refetchOnReconnect: "always",
  });
}

/**
 * Options for useTasks.
 *
 * `completedWindowDays` — SQL-level cap on how far back completed tasks
 * are loaded. The default (`null`) loads ALL completed tasks (legacy
 * behaviour). Pass a number (e.g. `30`) to cap to «recently completed».
 * Pass `0` to load NO completed tasks at all.
 *
 * Why this matters: on long-lived accounts 70–90% of tasks are completed,
 * most of them old. Capping the window cuts wire payload, parsing time,
 * memory and per-mutation cache work by a large factor — without breaking
 * any view that needs to *render* recently completed tasks (TaskList's
 * «Выполнено» section, Calendar strikethrough, dashboards, PMO/NPD).
 *
 * Search (Cmd+K / GlobalSearch) does its own server-side `ilike` queries
 * across the full table and is NOT affected by this option — old completed
 * tasks remain fully searchable.
 *
 * Views that legitimately need full history (ArchiveView, weekly reports,
 * PMO baseline analytics) should pass `completedWindowDays: null` (or omit).
 */
export interface UseTasksOptions {
  /** `null` = unlimited (default), `0` = no completed, `N` = last N days. */
  completedWindowDays?: number | null;
}

export function useTasks(
  groupId?: string | null,
  filterTags?: string[] | null,
  options?: UseTasksOptions,
) {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const completedWindowDays = options?.completedWindowDays ?? null;

  // Realtime subscription moved to useRealtimeSubscriptions (singleton at App root)

  return useQuery({
    queryKey: ["tasks", user?.id, groupId, filterTags, completedWindowDays],
    queryFn: async () => {
      // Apply the same client-side filter that's used at the end so streamed
      // intermediate results are visually consistent with the final array.
      const filterChunk = (chunk: Task[]): Task[] => {
        if (groupId) return chunk;
        return chunk.filter(
          (t) => !(t as any).is_draft && (t as any).task_type !== "stm_stage",
        );
      };

      const queryKey = ["tasks", user?.id, groupId, filterTags, completedWindowDays] as const;

      // Streaming pagination: publish each page to React Query cache as it
      // arrives so the UI updates progressively. Skipped when filterTags is
      // active because the post-pass needs the full array to do the
      // project-hierarchy expansion (publishing partial pre-tag-filter data
      // would briefly show wrong rows). For per-group queries (groupId set)
      // the streaming has no measurable effect because pages are tiny — but
      // it's still safe to leave on.
      const canStream = !filterTags || filterTags.length === 0;

      const controller = new AbortController();
      const tasks = await fetchAllPagesStreaming<Task>((from, to) => {
        let query = supabase
          .from("tasks")
          .select(filterTags && filterTags.length > 0 ? "*, task_tags(tag_id)" : "*")
          .order("is_completed", { ascending: true })
          .order("position")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to)
          .abortSignal(controller.signal);

        if (groupId) {
          query = query.eq("group_id", groupId);
        } else {
          // ⚡ Server-side exclusion of stm_stage tasks from global lists.
          // 60%+ of tasks in mature accounts are stm_stage; excluding them
          // server-side cuts payload by ~3x and avoids parsing them client-side.
          // Client-side filter below remains as a safety net (also strips drafts).
          query = query.or("task_type.is.null,task_type.neq.stm_stage");
        }

        if (completedWindowDays === 0) {
          // No completed at all.
          query = query.eq("is_completed", false);
        } else if (typeof completedWindowDays === "number" && completedWindowDays > 0) {
          // Active OR recently-completed.
          const cutoff = new Date(Date.now() - completedWindowDays * 86400 * 1000).toISOString();
          query = query.or(`is_completed.eq.false,completed_at.gte.${cutoff}`);
        }

        return query as unknown as PromiseLike<{ data: Task[] | null; error: unknown }>;
      }, (accumulated, isFinal) => {
        if (!canStream || isFinal) return; // final page is published by useQuery itself
        // Push intermediate result so the list paints early. The final
        // resolution will overwrite this with the post-processed array.
        qc.setQueryData<Task[]>(queryKey, filterChunk(accumulated));
      }, TASK_BOOT_MAX_PAGES, (accumulated) => {
        if (groupId || filterTags?.length) return false;
        return accumulated.length >= SUPABASE_PAGE_SIZE;
      });

      let filteredTasks = tasks;

      // ⚠️ INVARIANT — Draft visibility rule (см. mem://features/protocol-draft-publish):
      // Черновики (is_draft=true) скрываются ТОЛЬКО из глобальных списков (groupId не задан).
      // При просмотре конкретного протокола (groupId передан) черновики ОБЯЗАНЫ быть видны
      // владельцу/участникам — иначе протокол выглядит «пустым» до публикации.
      // Любой компонент внутри страницы протокола ДОЛЖЕН вызывать useTasks(protocolId),
      // а не useTasks() без аргументов.
      //
      // STM stage tasks (task_type='stm_stage') живут только в /npd/stm matrix.
      // Из глобальных списков (Inbox/Today/All) они скрываются, чтобы не засорять GTD-фокус.
      // На странице конкретного SKU (groupId задан) они остаются видны.
      if (!groupId) {
        filteredTasks = filteredTasks.filter(t => !(t as any).is_draft && (t as any).task_type !== "stm_stage");
      }

      if (filterTags && filterTags.length > 0) {
        // Smart project tag filtering: if tag is a linked_tag_id of a project,
        // also include tasks from subprojects
        const { data: linkedGroups } = await supabase
          .from("task_groups")
          .select("id, parent_id")
          .in("linked_tag_id", filterTags);

        const projectIds = (linkedGroups || []).map(g => g.id);
        let subGroupIds: string[] = [];
        if (projectIds.length > 0) {
          const { data: subGroups } = await supabase
            .from("task_groups")
            .select("id")
            .in("parent_id", projectIds);
          subGroupIds = (subGroups || []).map(g => g.id);
        }
        const expandedGroupIds = new Set([...projectIds, ...subGroupIds]);

        filteredTasks = filteredTasks.filter(t => {
          // Task matches if it has ALL filter tags
          const hasAllTags = filterTags.every(tagId =>
            t.task_tags?.some(tt => tt.tag_id === tagId)
          );
          if (hasAllTags) return true;

          // OR task belongs to a project/subproject whose linked tag is in the filter
          if (expandedGroupIds.size > 0 && t.group_id && expandedGroupIds.has(t.group_id)) {
            return true;
          }

          return false;
        });
      }

      void hydrateTaskRelationsInBackground(qc, queryKey, filteredTasks);

      return filteredTasks;
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    refetchOnReconnect: "always",
  });
}

export function useTags() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["tags", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id,name,color,category_id,user_id,created_at").order("name");
      if (error) throw error;
      return data as Tag[];
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    refetchOnReconnect: "always",
  });
}

/**
 * Returns a Set of tag IDs that are auto-linked to projects (technical tags).
 * These should be hidden from sidebar filters and tag pickers.
 */
export function useLinkedTagIds(): Set<string> {
  const { data: groups = [] } = useTaskGroups();
  return useMemo(
    () => new Set(groups.map(g => g.linked_tag_id).filter(Boolean) as string[]),
    [groups]
  );
}

/**
 * Returns tags filtered to exclude:
 * 1. Auto-linked project tags (linked_tag_id)
 * 2. NPD gate tags (names starting with "Gate ")
 * 3. NPD stream tags (category "Стримы")
 * Use this in all UI components instead of useTags() directly.
 */
const GATE_TAG_RE = /^Gate \d/i;

export function useVisibleTags() {
  const { data: allTags = [], ...rest } = useTags();
  const linkedTagIds = useLinkedTagIds();
  const { data: categories = [] } = useTagCategories();

  const data = useMemo(() => {
    // Find "Стримы" category IDs (NPD stream categories are technical)
    const streamCatIds = new Set(
      categories
        .filter(c => c.name === "Стримы")
        .map(c => c.id)
    );
    return allTags.filter(t =>
      !linkedTagIds.has(t.id) &&
      !GATE_TAG_RE.test(t.name) &&
      !(t.category_id && streamCatIds.has(t.category_id))
    );
  }, [allTags, linkedTagIds, categories]);
  return { data, ...rest };
}

export function useTagCategories() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["tag_categories", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tag_categories" as any).select("id,name,color,position,user_id,created_at,parent_id").order("position");
      if (error) throw error;
      return (data || []) as unknown as TagCategory[];
    },
    enabled: !loading && !!user,
    staleTime: 1000 * 60 * 5,
    refetchOnReconnect: "always",
  });
}

export function useAvailableUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["available_users", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email, telegram_username, username")
        .abortSignal(AbortSignal.timeout(20_000));
      if (error) throw error;
      return (data || []) as Profile[];
    },
    enabled: !!user,
  });
}

export function useTaskParticipants(taskId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["task_participants", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_participants" as any)
        .select("*")
        .eq("task_id", taskId!);
      if (error) throw error;
      return (data || []) as unknown as TaskParticipant[];
    },
    enabled: !!user && !!taskId,
  });
}

export function useTaskParticipantsBulk(taskIds: string[]) {
  const { user } = useAuth();
  const sortedIds = useMemo(() => [...new Set(taskIds)].sort(), [taskIds]);
  const key = sortedIds.join(",");

  return useQuery({
    queryKey: ["task_participants", "bulk", key],
    queryFn: async () => {
      const byTask = new Map<string, TaskParticipant[]>();
      const BATCH = 200;

      for (let i = 0; i < sortedIds.length; i += BATCH) {
        const chunk = sortedIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("task_participants" as any)
          .select("*")
          .in("task_id", chunk);

        if (error) throw error;

        for (const row of (data || []) as unknown as TaskParticipant[]) {
          const list = byTask.get(row.task_id) || [];
          list.push(row);
          byTask.set(row.task_id, list);
        }
      }

      return byTask;
    },
    enabled: !!user && sortedIds.length > 0,
    staleTime: 30_000,
  });
}

export function useGroupMembers(groupId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["group_members", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data as { id: string; group_id: string; user_id: string; role: string; invited_by: string; created_at: string }[];
    },
    enabled: !!user && !!groupId,
  });
}

// --- Group Tags ---

export function useGroupTags(groupId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["group_tags", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_tags" as any)
        .select("tag_id")
        .eq("group_id", groupId!) as { data: { tag_id: string }[] | null; error: any };
      if (error) throw error;
      return (data || []) as { tag_id: string }[];
    },
    enabled: !!user && !!groupId,
  });
}

// --- Project Folders ---

export function useProjectFolders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project_folders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as ProjectFolder[];
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

export function useProjectFolderItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project_folder_items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folder_items" as any)
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []) as unknown as ProjectFolderItem[];
    },
    enabled: !!user,
    staleTime: 1000 * 30,
  });
}

// --- Mutations with optimistic updates ---

export function useTaskMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  // ========== GROUPS ==========

  const addGroup = useMutation({
    mutationFn: async ({ name, parent_id, initial_tag_ids }: { name: string; parent_id?: string | null; initial_tag_ids?: string[] }) => {
      await checkDuplicateName(name, "project", user!.id);

      // Reuse an existing free-standing tag with the same name (case-insensitive)
      // so the new project becomes the umbrella for tasks already tagged with it.
      // Only consider the user's OWN tags here — RLS already scopes the query, but we
      // double-check user_id for safety. Skip tags already linked to another project.
      const normalized = name.trim().toLowerCase();
      const { data: existingTags } = await supabase
        .from("tags")
        .select("id, name, user_id")
        .eq("user_id", user!.id);
      const { data: linkedRows } = await supabase
        .from("task_groups")
        .select("linked_tag_id")
        .eq("user_id", user!.id);
      const linkedTagIds = new Set(
        (linkedRows || []).map((g: any) => g.linked_tag_id).filter(Boolean),
      );
      const reusable = (existingTags || []).find(
        (t: any) =>
          t.name?.trim().toLowerCase() === normalized && !linkedTagIds.has(t.id),
      );

      let tagId: string;
      if (reusable) {
        tagId = reusable.id;
      } else {
        const { data: tagData, error: tagError } = await supabase
          .from("tags")
          .insert({ name, user_id: user!.id, color: "#3b82f6" })
          .select()
          .single();
        if (tagError) throw tagError;
        tagId = tagData.id;
      }

      const { data: groupData, error } = await supabase.from("task_groups").insert({
        name,
        user_id: user!.id,
        linked_tag_id: tagId,
        parent_id: parent_id || null,
      } as any).select().single();
      if (error) throw error;

      // Auto-add creator as group member (owner)
      await supabase.from("group_members").insert({
        group_id: groupData.id,
        user_id: user!.id,
        invited_by: user!.id,
        role: "owner",
      });

      // ===== Tag inheritance =====
      // Collect candidate tag_ids to attach as group_tags (метки контекста):
      // 1) explicit initial_tag_ids passed by caller
      // 2) non-system group_tags inherited from parent project
      // System tags (площадка/бренд/территория и т.п.) НЕ наследуем автоматически —
      // их пользователь явно навешивает в нужном месте.
      const candidateIds = new Set<string>((initial_tag_ids || []).filter(Boolean));

      if (parent_id) {
        const { data: parentTagRows } = await supabase
          .from("group_tags" as any)
          .select("tag_id")
          .eq("group_id", parent_id);
        const parentTagIds = (parentTagRows || []).map((r: any) => r.tag_id).filter(Boolean);
        if (parentTagIds.length > 0) {
          // copy all parent group_tags (per user's choice: "Да, копировать все group_tags родителя")
          parentTagIds.forEach((id: string) => candidateIds.add(id));
        }
      }

      // Never duplicate the linked_tag_id as a group_tag — it's already the umbrella.
      candidateIds.delete(tagId);

      if (candidateIds.size > 0) {
        const rows = Array.from(candidateIds).map((tag_id) => ({
          group_id: groupData.id,
          tag_id,
        }));
        // Best-effort insert; ignore conflicts so re-runs are safe.
        await supabase.from("group_tags" as any).insert(rows);
      }
    },
    onMutate: async ({ name, parent_id }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => [
        ...groups,
        { id: tempId(), name, user_id: user!.id, position: groups.length, created_at: new Date().toISOString(), parent_id: parent_id || null, linked_tag_id: null, icon: "list", color: "#3b82f6", description: null } as TaskGroup,
      ]);
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); toast.error(_e.message); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["task_groups"] }); qc.invalidateQueries({ queryKey: ["tags"] }); },
  });

  const updateGroupAppearance = useMutation({
    mutationFn: async ({ id, icon, color }: { id: string; icon?: string | null; color?: string | null }) => {
      const updates: Record<string, any> = {};
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      const { error } = await supabase.from("task_groups").update(updates).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, icon, color }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) =>
        groups.map(g => g.id === id ? { ...g, ...(icon !== undefined ? { icon } : {}), ...(color !== undefined ? { color } : {}) } : g)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await checkDuplicateName(name, "project", user!.id, id);
      const { error } = await supabase.from("task_groups").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, name } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); toast.error(_e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snapG = snapshotGroups(qc);
      const snapT = snapshotTasks(qc);
      updateAllGroupCaches(qc, (groups) => groups.filter(g => g.id !== id));
      updateAllTaskCaches(qc, (tasks) => tasks.filter(t => t.group_id !== id));
      return { snapG, snapT };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapG) restoreGroups(qc, ctx.snapG);
      if (ctx?.snapT) restoreTasks(qc, ctx.snapT);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["task_groups"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  const updateGroupDescription = useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string | null }) => {
      const { error } = await supabase.from("task_groups").update({ description } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, description }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, description } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const updateGroupParent = useMutation({
    mutationFn: async ({ id, parent_id }: { id: string; parent_id: string | null }) => {
      const { error } = await supabase.from("task_groups").update({ parent_id }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, parent_id }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, parent_id } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const updateGroupProjectType = useMutation({
    mutationFn: async ({ id, project_type }: { id: string; project_type: string }) => {
      const { error } = await supabase.from("task_groups").update({ project_type } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, project_type }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, project_type } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["crm-groups-list"] });
      qc.invalidateQueries({ queryKey: ["crm-tasks"] });
    },
  });

  const closeProject = useMutation({
    mutationFn: async ({ id, closed_at }: { id: string; closed_at: string | null }) => {
      const { error } = await supabase.from("task_groups").update({ closed_at } as any).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, closed_at }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, closed_at } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const updateBaselineSettings = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; baseline_approver_id?: string | null; baseline_auto_lock_hours?: number }) => {
      const { error } = await supabase.from("task_groups").update(fields as any).eq("id", id);
      if (error) throw error;

      // Notify new approver
      if (fields.baseline_approver_id) {
        const { data: group } = await supabase.from("task_groups").select("name").eq("id", id).single();
        notifyEvent("baseline_approver_assigned", group?.name || "Проект", [fields.baseline_approver_id]);
      }
    },
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g => g.id === id ? { ...g, ...fields } : g));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  const lockBaseline = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const now = new Date().toISOString();
      const { data: group } = await supabase.from("task_groups").select("name, baseline_approver_id").eq("id", id).single();

      const { error } = await supabase.from("task_groups").update({
        baseline_status: 'locked',
        baseline_locked_at: now,
      } as any).eq("id", id);
      if (error) throw error;

      const { data: subgroups } = await supabase.from("task_groups").select("id").eq("parent_id", id);
      if (subgroups?.length) {
        await Promise.all(subgroups.map(sg =>
          supabase.from("task_groups").update({ baseline_status: 'locked', baseline_locked_at: now } as any).eq("id", sg.id)
        ));
      }

      const allGroupIds = [id, ...(subgroups || []).map(sg => sg.id)];
      const { data: tasks } = await supabase.from("tasks").select("id, deadline").in("group_id", allGroupIds).not("deadline", "is", null);
      if (tasks?.length) {
        await Promise.all(tasks.map(t =>
          supabase.from("tasks").update({ original_deadline: t.deadline } as any).eq("id", t.id)
        ));
      }

      // Notify approver that baseline was locked
      if ((group as any)?.baseline_approver_id) {
        notifyEvent("baseline_locked", group?.name || "Проект", [(group as any).baseline_approver_id]);
      }
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g =>
        g.id === id || g.parent_id === id
          ? { ...g, baseline_status: 'locked', baseline_locked_at: new Date().toISOString() }
          : g
      ));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const unlockBaseline = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("task_groups").update({
        baseline_status: 'planning',
        baseline_locked_at: null,
      } as any).eq("id", id);
      if (error) throw error;

      const { data: subgroups } = await supabase.from("task_groups").select("id").eq("parent_id", id);
      if (subgroups?.length) {
        await Promise.all(subgroups.map(sg =>
          supabase.from("task_groups").update({ baseline_status: 'planning', baseline_locked_at: null } as any).eq("id", sg.id)
        ));
      }
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      updateAllGroupCaches(qc, (groups) => groups.map(g =>
        g.id === id || g.parent_id === id
          ? { ...g, baseline_status: 'planning', baseline_locked_at: null }
          : g
      ));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });


  const reorderGroups = useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase.from("task_groups").update({ position }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
    },
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["task_groups"] });
      const snap = snapshotGroups(qc);
      const posMap = new Map(items.map(i => [i.id, i.position]));
      updateAllGroupCaches(qc, (groups) =>
        groups.map(g => posMap.has(g.id) ? { ...g, position: posMap.get(g.id)! } : g)
          .sort((a, b) => a.position - b.position)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreGroups(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task_groups"] }),
  });

  // --- Notification helper (fire-and-forget) ---
  const notifyEvent = async (
    event: string,
    taskTitle: string,
    targetUserIds: string[],
    taskId?: string | null,
  ) => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      supabase.functions.invoke("notify-event", {
        body: { event, taskTitle, targetUserIds, taskId: taskId || null },
        headers: { Authorization: `Bearer ${session.session.access_token}` },
      }).catch(() => {});
    } catch {}
  };

  // ========== TASKS ==========

  const addTask = useMutation({
    mutationFn: async (task: {
      title: string;
      group_id?: string | null;
      deadline?: string | null;
      assigned_to?: string | null;
      department_id?: string | null;
      contractor_id?: string | null;
      task_type?: string;
      client_name?: string;
      is_draft?: boolean;
      // Protocol-specific fields (for internal tasks created from a protocol)
      protocol_scope?: "external" | "internal";
      status_meta?: Record<string, any>;
      source_protocol_id?: string | null;
    }) => {
      const taskType = task.task_type || 'standard';
      let clientId: string | null = null;
      let resolvedGroupId = task.group_id || null;

      // For CRM tasks, create client + tag in "Клиенты" category
      if (taskType === 'crm' && task.client_name?.trim()) {
        const clientNameTrimmed = task.client_name.trim();

        // Find "Клиенты" subcategory (under "CRM / Продажи") for the current user
        const { data: categories } = await supabase.from("tag_categories").select("*");
        const crmParent = (categories || []).find((c: any) => c.name === 'CRM / Продажи' && !c.parent_id && c.user_id === user!.id);
        const clientsCat = (categories || []).find((c: any) => c.name === 'Клиенты' && c.parent_id === crmParent?.id && c.user_id === user!.id);

        // Case-insensitive tag lookup to avoid duplicates
        const { data: existingTags } = await supabase.from("tags").select("*").eq("user_id", user!.id);
        const existingTag = (existingTags || []).find(
          (t: any) => t.name.toLowerCase() === clientNameTrimmed.toLowerCase() && t.category_id === (clientsCat?.id || null)
        );

        let tagId: string;
        if (existingTag) {
          tagId = existingTag.id;
        } else {
          const { data: tagData } = await supabase.from("tags").insert({
            name: clientNameTrimmed,
            user_id: user!.id,
            color: '#ef4444',
            category_id: clientsCat?.id || null,
          }).select().single();
          tagId = tagData?.id || '';
        }

        // Auto-find or create "Новые клиенты" project
        if (!resolvedGroupId) {
          const { data: allGroups } = await supabase.from("task_groups").select("*").eq("user_id", user!.id);
          const ncProject = (allGroups || []).find(
            (g: any) => g.name.toLowerCase() === 'новые клиенты' && !g.parent_id
          );
          if (ncProject) {
            resolvedGroupId = ncProject.id;
          } else {
            // Create the project
            const { data: newProject } = await supabase.from("task_groups").insert({
              name: 'Новые клиенты',
              user_id: user!.id,
              icon: '🤝',
              color: '#ef4444',
              project_type: 'crm',
            } as any).select().single();
            resolvedGroupId = (newProject as any)?.id || null;
            // Auto-add creator as group member
            if (resolvedGroupId) {
              await supabase.from("group_members").insert({
                group_id: resolvedGroupId,
                user_id: user!.id,
                invited_by: user!.id,
                role: "owner",
              });
            }
          }
        }

        // Find or create client (общий справочник, без дублей по lower(name))
        const { data: upsertedId, error: upsertErr } = await supabase
          .rpc("upsert_client_by_name", { _name: clientNameTrimmed, _user_id: user!.id });
        if (upsertErr) throw upsertErr;
        clientId = (upsertedId as string) || null;

        // Создаём/обновляем персональное назначение (manager, project, tag)
        if (clientId) {
          await supabase.from("client_assignments").upsert({
            user_id: user!.id,
            client_id: clientId,
            group_id: resolvedGroupId,
            tag_id: tagId,
          } as any, { onConflict: "user_id,client_id" });
        }
      }

      const now = new Date().toISOString();
      const { data: taskData, error } = await supabase.from("tasks").insert({
        title: task.title,
        group_id: resolvedGroupId,
        user_id: user!.id,
        deadline: task.deadline || null,
        assigned_to: task.assigned_to || null,
        department_id: task.department_id || null,
        contractor_id: task.contractor_id || null,
        task_type: taskType,
        client_id: clientId,
        start_at: now,
        is_draft: task.is_draft ?? false,
        // Protocol fields — propagate so internal tasks stay isolated
        protocol_scope: task.protocol_scope ?? "external",
        status_meta: task.status_meta ?? {},
        source_protocol_id: task.source_protocol_id ?? null,
      } as any).select().single();
      if (error) throw error;

      const { error: partError } = await supabase.from("task_participants").insert({
        task_id: taskData.id,
        user_id: user!.id,
        role: "creator",
      });
      if (partError) console.error("Failed to add creator as participant:", partError);

      if (resolvedGroupId) {
        const { data: group } = await supabase
          .from("task_groups")
          .select("*")
          .eq("id", resolvedGroupId)
          .single();
        
        if (group && (group as any).linked_tag_id) {
          await supabase.from("task_tags").insert({
            task_id: taskData.id,
            tag_id: (group as any).linked_tag_id,
          });
        }

        // Notify group members about new task — SKIP for drafts (protocols)
        if (!task.is_draft) {
          const { data: members } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", resolvedGroupId);
          const memberIds = (members || []).map((m: any) => m.user_id);
          if (memberIds.length > 0) {
            notifyEvent("new_task_in_group", task.title, memberIds, taskData.id);
          }
        }
      }

      // For CRM tasks, also assign the client tag to the task
      if (taskType === 'crm' && task.client_name?.trim()) {
        const clientNameTrimmed = task.client_name.trim();
        const { data: clientTag } = await supabase.from("tags").select("id").eq("user_id", user!.id).eq("name", clientNameTrimmed).maybeSingle();
        if (clientTag) {
          await supabase.from("task_tags").insert({ task_id: taskData.id, tag_id: clientTag.id }).maybeSingle();
        }
      }

      // For CRM tasks, create template subtasks (funnel steps)
      if (taskType === 'crm') {
        const crmSteps = [
          'Отправить презентацию и КП',
          'Получить обратную связь',
          'Проведены переговоры',
          'Старт отгрузок',
        ];
        const subtaskInserts = crmSteps.map((title, i) => ({
          task_id: taskData.id,
          title,
          position: i,
        }));
        await supabase.from("subtasks").insert(subtaskInserts);

        // Link client tag to the task
        if (task.client_name?.trim()) {
          const clientNameLower = task.client_name.trim().toLowerCase();
          const { data: tags } = await supabase.from("tags").select("id, name").eq("user_id", user!.id);
          const matchedTag = (tags || []).find((t: any) => t.name.toLowerCase() === clientNameLower);
          if (matchedTag) {
            await supabase.from("task_tags").insert({ task_id: taskData.id, tag_id: matchedTag.id });
          }
        }
      }

      return taskData;
    },
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      const optimisticTask: Task = {
        id: tempId(),
        title: task.title,
        group_id: task.group_id || null,
        user_id: user!.id,
        deadline: task.deadline || null,
        original_deadline: task.deadline || null,
        is_completed: false,
        is_important: false,
        position: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        description: null,
        assigned_to: task.assigned_to || null,
        recurrence: null,
        recurrence_end_date: null,
        parent_recurring_id: null,
        priority: null,
        deferred_until: null,
        task_type: task.task_type || 'standard',
        start_at: new Date().toISOString(),
        client_id: null,
        delegated_from: null,
        requires_approval: false,
        approval_status: null,
        closure_result: null,
        closure_attachments: [],
        source_protocol_id: task.source_protocol_id ?? null,
        is_draft: task.is_draft ?? false,
        external_ref: null,
        external_assignee: null,
        department_id: task.department_id || null,
        contractor_id: task.contractor_id || null,
        status_meta: task.status_meta ?? {},
        protocol_scope: task.protocol_scope ?? 'external',
        stage_key: null,
        stm_flow: null,
        subtasks: [],
        task_tags: [],
        follow_up_of: (task as any).follow_up_of ?? null,
      };
      updateAllTaskCaches(qc, (tasks) => [optimisticTask, ...tasks]);
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); toast.error(_e.message); },
    onSettled: (_d, _e, task) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_participants"] });
      if (task.task_type === 'crm') {
        qc.invalidateQueries({ queryKey: ["tags"] });
        qc.invalidateQueries({ queryKey: ["tag_categories"] });
        qc.invalidateQueries({ queryKey: ["task_groups"] });
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesInsert<"tasks">>) => {
      // Deadline validation: can't set deadline earlier than latest subtask deadline
      if ('deadline' in updates && updates.deadline) {
        const { data: subs } = await supabase.from("subtasks").select("deadline").eq("task_id", id);
        if (subs && subs.length > 0) {
          const latestSubDeadline = subs.reduce((latest: Date | null, s) => {
            if (s.deadline) {
              const d = new Date(s.deadline);
              return !latest || d > latest ? d : latest;
            }
            return latest;
          }, null);
          if (latestSubDeadline && new Date(updates.deadline as string) < latestSubDeadline) {
            const formatted = latestSubDeadline.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
            toast.error(`Нельзя установить срок раньше ${formatted} — есть шаги с более поздним дедлайном`);
            throw new Error("Deadline earlier than subtask deadline");
          }
        }
      }

      // Handle linked tag sync when changing group_id
      if ('group_id' in updates) {
        const { data: currentTask } = await supabase.from("tasks").select("group_id").eq("id", id).single();
        const oldGroupId = currentTask?.group_id;
        const newGroupId = updates.group_id;

        // Remove old project's linked tag
        if (oldGroupId && oldGroupId !== newGroupId) {
          const { data: oldGroup } = await supabase.from("task_groups").select("linked_tag_id").eq("id", oldGroupId).single();
          if (oldGroup?.linked_tag_id) {
            await supabase.from("task_tags").delete().eq("task_id", id).eq("tag_id", oldGroup.linked_tag_id);
          }
        }

        // Add new project's linked tag
        if (newGroupId && newGroupId !== oldGroupId) {
          const { data: newGroup } = await supabase.from("task_groups").select("linked_tag_id").eq("id", newGroupId as string).single();
          if (newGroup?.linked_tag_id) {
            await supabase.from("task_tags").insert({ task_id: id, tag_id: newGroup.linked_tag_id }).maybeSingle();
          }
        }
      }
      // Baseline lock: if project is in 'planning' status, update original_deadline with deadline
      if ('deadline' in updates && updates.deadline) {
        const { data: currentTask } = await supabase.from("tasks").select("group_id").eq("id", id).single();
        if (currentTask?.group_id) {
          // Check project (or parent project) baseline_status
          const { data: projectGroup } = await supabase.from("task_groups").select("baseline_status, parent_id").eq("id", currentTask.group_id).single();
          let isPlanning = (projectGroup as any)?.baseline_status === 'planning';
          // If subproject, also check parent project status
          if (!isPlanning && projectGroup?.parent_id) {
            const { data: parentGroup } = await supabase.from("task_groups").select("baseline_status").eq("id", projectGroup.parent_id).single();
            isPlanning = (parentGroup as any)?.baseline_status === 'planning';
          }
          if (isPlanning) {
            (updates as any).original_deadline = updates.deadline;
          }
        }
      }

      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) throw error;

      // Notify on assignment or delegation
      if (updates.assigned_to && updates.assigned_to !== user?.id) {
        const { data: taskData } = await supabase.from("tasks").select("title").eq("id", id).single();
        const event = updates.delegated_from ? "task_delegated" : "task_assigned";
        notifyEvent(event, taskData?.title || "", [updates.assigned_to as string], id);
      }
    },
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) => tasks.map(t => t.id === id ? { ...t, ...updates } : t));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => {
      // Mark stale only — optimistic update has applied; realtime will deliver
      // any server-side changes within ~1.5s. Avoids parallel refetch storm
      // across all useTasks(groupId, filterTags) variants.
      qc.invalidateQueries({ queryKey: ["tasks"], refetchType: "none" });
      qc.invalidateQueries({ queryKey: ["crm-tasks"], refetchType: "none" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) => tasks.filter(t => t.id !== id));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"], refetchType: "none" }),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { data: taskData } = await supabase.from("tasks").select("*").eq("id", id).single();
      
      const { error } = await supabase.from("tasks").update({
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;

      // Auto-create next recurring task
      if (is_completed && taskData && (taskData as any).recurrence) {
        const rec = (taskData as any).recurrence as string;
        const now = new Date();
        let nextDeadline: Date | null = null;
        
        const addRecurrence = (d: Date, r: string) => {
          if (r === "daily") d.setDate(d.getDate() + 1);
          else if (r === "weekdays") {
            d.setDate(d.getDate() + 1);
            while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
          }
          else if (r === "every2days") d.setDate(d.getDate() + 2);
          else if (r === "every3days") d.setDate(d.getDate() + 3);
          else if (r === "weekly") d.setDate(d.getDate() + 7);
          else if (r === "biweekly") d.setDate(d.getDate() + 14);
          else if (r === "monthly") d.setMonth(d.getMonth() + 1);
          else if (r === "quarterly") d.setMonth(d.getMonth() + 3);
          else if (r === "semiannually") d.setMonth(d.getMonth() + 6);
          else if (r === "yearly") d.setFullYear(d.getFullYear() + 1);
        };
        if (taskData.deadline) {
          const d = new Date(taskData.deadline);
          addRecurrence(d, rec);
          nextDeadline = d;
        } else {
          addRecurrence(now, rec);
          nextDeadline = now;
        }

        const endDate = (taskData as any).recurrence_end_date;
        if (endDate && nextDeadline && nextDeadline > new Date(endDate)) {
          // Past end date, don't create next
        } else {
          await supabase.from("tasks").insert({
            title: taskData.title,
            description: taskData.description,
            group_id: taskData.group_id,
            user_id: taskData.user_id,
            is_important: taskData.is_important,
            deadline: nextDeadline?.toISOString() || null,
            assigned_to: taskData.assigned_to,
            recurrence: rec,
            recurrence_end_date: endDate,
            parent_recurring_id: (taskData as any).parent_recurring_id || id,
            start_at: new Date().toISOString(),
          } as any);
        }
      }

      // Notify participants on task completion
      if (is_completed && taskData) {
        const { data: participants } = await supabase
          .from("task_participants")
          .select("user_id")
          .eq("task_id", id);
        const targetIds = (participants || []).map((p: any) => p.user_id);
        if (targetIds.length > 0) {
          notifyEvent("task_completed", taskData.title, targetIds, id);
        }
      }
    },
    onMutate: async ({ id, is_completed }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === id ? { ...t, is_completed, completed_at: is_completed ? new Date().toISOString() : null } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"], refetchType: "none" }),
  });

  // Submit task for approval (instead of direct completion)
  const submitForApproval = useMutation({
    mutationFn: async ({ id, closure_result, attachmentUrls }: { id: string; closure_result: string; attachmentUrls?: string[] }) => {
      const { error } = await supabase.from("tasks").update({
        approval_status: "pending",
        closure_result,
        closure_attachments: attachmentUrls || [],
      }).eq("id", id);
      if (error) throw error;
      const { data: taskData } = await supabase.from("tasks").select("title, user_id").eq("id", id).single();
      if (taskData) {
        notifyEvent("task_completed", `⏳ Задача «${taskData.title}» ожидает утверждения`, [taskData.user_id], id);
      }
    },
    onMutate: async ({ id, closure_result }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === id ? { ...t, approval_status: "pending", closure_result } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); toast.error("Не удалось отправить на утверждение"); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const approveTask = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: taskData } = await supabase.from("tasks").select("*").eq("id", id).single();
      if (!taskData) throw new Error("Task not found");
      const { error } = await supabase.from("tasks").update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        approval_status: "approved",
      }).eq("id", id);
      if (error) throw error;
      if (taskData.group_id && (taskData as any).closure_result) {
        const attachments = Array.isArray((taskData as any).closure_attachments) ? (taskData as any).closure_attachments as string[] : [];
        const attachmentsMd = attachments.length > 0
          ? `\n\n## Вложения\n\n${attachments.map((url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url) ? `![вложение](${url})` : `[📎 ${decodeURIComponent(url.split("/").pop() || "файл")}](${url})`).join("\n\n")}`
          : "";
        const content = `## Результат\n\n${(taskData as any).closure_result}${attachmentsMd}\n\n---\n\n**Задача:** ${taskData.title}\n**Дата закрытия:** ${new Date().toLocaleDateString("ru-RU")}\n**Исполнитель:** ${taskData.assigned_to || taskData.user_id}`;
        await supabase.from("wiki_pages").insert({
          group_id: taskData.group_id,
          user_id: user!.id,
          title: `✅ ${taskData.title}`,
          content,
          icon: "✅",
          page_type: "wiki",
        });
      }
      const targetIds = [taskData.assigned_to, taskData.user_id].filter(Boolean).filter(uid => uid !== user!.id) as string[];
      if (targetIds.length > 0) {
        notifyEvent("task_completed", taskData.title, targetIds, id);
      }
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === id ? { ...t, is_completed: true, completed_at: new Date().toISOString(), approval_status: "approved" } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); toast.error("Не удалось утвердить"); },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["wiki_pages"] });
    },
  });

  const rejectTask = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: taskData } = await supabase.from("tasks").select("title, assigned_to").eq("id", id).single();
      const { error } = await supabase.from("tasks").update({
        approval_status: null,
        closure_result: null,
        closure_attachments: [],
      }).eq("id", id);
      if (error) throw error;
      if (taskData?.assigned_to) {
        notifyEvent("task_completed", `❌ Задача «${taskData.title}» отклонена, требуется доработка`, [taskData.assigned_to], id);
      }
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === id ? { ...t, approval_status: null, closure_result: null } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); toast.error("Не удалось отклонить"); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleImportant = useMutation({
    mutationFn: async ({ id, is_important }: { id: string; is_important: boolean }) => {
      const { error } = await supabase.from("tasks").update({ is_important }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, is_important }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) => tasks.map(t => t.id === id ? { ...t, is_important } : t));
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    // Optimistic state is already correct; skip refetch (saves ~200-400ms
    // network round-trip + a list re-render for every star tap).
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"], refetchType: "none" }),
  });

  const reorderTasks = useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase.from("tasks").update({ position }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
    },
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      const posMap = new Map(items.map(i => [i.id, i.position]));
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => posMap.has(t.id) ? { ...t, position: posMap.get(t.id)! } : t)
          .sort((a, b) => {
            if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
            return a.position - b.position;
          })
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // ========== SUBTASKS ==========

  const addSubtask = useMutation({
    mutationFn: async ({ task_id, title }: { task_id: string; title: string }) => {
      const { error } = await supabase.from("subtasks").insert({ task_id, title });
      if (error) throw error;
    },
    onMutate: async ({ task_id, title }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      const newSubtask: Subtask = { id: tempId(), task_id, title, is_completed: false, position: 0, created_at: new Date().toISOString(), deadline: null, assigned_to: null };
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === task_id ? { ...t, subtasks: [...(t.subtasks || []), newSubtask] } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggleSubtask = useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { error } = await supabase.from("subtasks").update({ is_completed }).eq("id", id);
      if (error) throw error;

      // Reverse sync: if completing last subtask, check if we can shorten deadline
      if (is_completed) {
        const { data: subtaskRow } = await supabase.from("subtasks").select("task_id").eq("id", id).single();
        if (subtaskRow) {
          const { data: allSubs } = await supabase.from("subtasks").select("is_completed, deadline").eq("task_id", subtaskRow.task_id);
          const { data: taskRow } = await supabase.from("tasks").select("id, deadline").eq("id", subtaskRow.task_id).single();
          if (allSubs && taskRow?.deadline && allSubs.every(s => s.is_completed)) {
            const taskDeadline = new Date(taskRow.deadline);
            const now = new Date();
            // All subtasks done and task deadline is in the future — suggest shortening
            if (taskDeadline > now) {
              // Find latest subtask deadline among all subs
              const latestSubDeadline = allSubs.reduce((latest, s) => {
                if (s.deadline) {
                  const d = new Date(s.deadline);
                  return d > latest ? d : latest;
                }
                return latest;
              }, now);
              const newDeadline = latestSubDeadline > now ? latestSubDeadline : now;
              if (newDeadline < taskDeadline) {
                const formatted = newDeadline.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
                toast(`Все шаги завершены! Сократить срок до ${formatted}?`, {
                  action: {
                    label: "Сократить",
                    onClick: () => {
                      const dl = new Date(newDeadline);
                      dl.setHours(23, 59, 59, 0);
                      supabase.from("tasks").update({ deadline: dl.toISOString() }).eq("id", taskRow.id).then(() => {
                        qc.invalidateQueries({ queryKey: ["tasks"] });
                        toast.success("Срок задачи сокращён");
                      });
                    },
                  },
                  duration: 8000,
                });
              }
            }
          }
        }
      }
    },
    onMutate: async ({ id, is_completed }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => ({
          ...t,
          subtasks: t.subtasks?.map(s => s.id === id ? { ...s, is_completed } : s),
        }))
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => ({ ...t, subtasks: t.subtasks?.filter(s => s.id !== id) }))
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const reorderSubtasks = useMutation({
    mutationFn: async (items: { id: string; position: number }[]) => {
      const promises = items.map(({ id, position }) =>
        supabase.from("subtasks").update({ position }).eq("id", id)
      );
      const results = await Promise.all(promises);
      const err = results.find(r => r.error);
      if (err?.error) throw err.error;
    },
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      const posMap = new Map(items.map(i => [i.id, i.position]));
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => ({
          ...t,
          subtasks: t.subtasks
            ?.map(s => posMap.has(s.id) ? { ...s, position: posMap.get(s.id)! } : s)
            .sort((a, b) => a.position - b.position),
        }))
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const updateSubtask = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; deadline?: string | null; assigned_to?: string | null }) => {
      const { error } = await supabase.from("subtasks").update(updates).eq("id", id);
      if (error) throw error;

      // Auto-extend parent task deadline if subtask deadline is later
      if (updates.deadline) {
        const subtaskDeadline = new Date(updates.deadline);
        // Find the parent task
        const { data: subtaskRow } = await supabase.from("subtasks").select("task_id").eq("id", id).single();
        if (subtaskRow) {
          const { data: taskRow } = await supabase.from("tasks").select("id, deadline, original_deadline").eq("id", subtaskRow.task_id).single();
          if (taskRow) {
            const shouldUpdate = !taskRow.deadline || subtaskDeadline > new Date(taskRow.deadline);
            if (shouldUpdate) {
              await supabase.from("tasks").update({ deadline: updates.deadline }).eq("id", taskRow.id);
              toast.info(`Дедлайн задачи ${taskRow.deadline ? 'сдвинут' : 'установлен'} → ${subtaskDeadline.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`, {
                description: taskRow.deadline ? "Шаг выходит за рамки задачи" : "Установлен по сроку шага",
              });
            }
          }
        }
      }
    },
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);

      // Also optimistically extend parent task deadline
      if (updates.deadline) {
        const subtaskDeadline = new Date(updates.deadline);
        updateAllTaskCaches(qc, (tasks) =>
          tasks.map(t => {
            const hasSub = t.subtasks?.some(s => s.id === id);
            const updated = { ...t, subtasks: t.subtasks?.map(s => s.id === id ? { ...s, ...updates } : s) };
            if (hasSub && (!t.deadline || subtaskDeadline > new Date(t.deadline))) {
              return { ...updated, deadline: updates.deadline! };
            }
            return updated;
          })
        );
      } else {
        updateAllTaskCaches(qc, (tasks) =>
          tasks.map(t => ({
            ...t,
            subtasks: t.subtasks?.map(s => s.id === id ? { ...s, ...updates } : s),
          }))
        );
      }
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // ========== TAGS ==========

  const addTag = useMutation({
    mutationFn: async ({ name, color, category_id }: { name: string; color?: string; category_id?: string | null }) => {
      await checkDuplicateName(name, "tag", user!.id);
      const { error } = await supabase.from("tags").insert({ name, color, user_id: user!.id, category_id: category_id || null } as any);
      if (error) throw error;
    },
    onMutate: async ({ name, color, category_id }) => {
      await qc.cancelQueries({ queryKey: ["tags"] });
      const prev = qc.getQueryData<Tag[]>(["tags", user?.id]);
      const optimistic: Tag = { id: tempId(), name, color: color || "#6366f1", user_id: user!.id, created_at: new Date().toISOString(), category_id: category_id || null };
      qc.setQueryData<Tag[]>(["tags", user?.id], (old) => old ? [...old, optimistic].sort((a, b) => a.name.localeCompare(b.name)) : [optimistic]);
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["tags", user?.id], ctx.prev); toast.error(_e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const renameTag = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await checkDuplicateName(name, "tag", user!.id, id);
      const { error } = await supabase.from("tags").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: ["tags"] });
      const prev = qc.getQueryData<Tag[]>(["tags", user?.id]);
      qc.setQueryData<Tag[]>(["tags", user?.id], (old) => old?.map(t => t.id === id ? { ...t, name } : t));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["tags", user?.id], ctx.prev); toast.error(_e.message); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tags"] });
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prevTags = qc.getQueryData<Tag[]>(["tags", user?.id]);
      const snapT = snapshotTasks(qc);
      qc.setQueryData<Tag[]>(["tags", user?.id], (old) => old?.filter(t => t.id !== id));
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => ({ ...t, task_tags: t.task_tags?.filter(tt => tt.tag_id !== id) }))
      );
      return { prevTags, snapT };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevTags) qc.setQueryData(["tags", user?.id], ctx.prevTags);
      if (ctx?.snapT) restoreTasks(qc, ctx.snapT);
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["tags"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });

  const addTaskTag = useMutation({
    mutationFn: async ({ task_id, tag_id }: { task_id: string; tag_id: string }) => {
      const { error } = await supabase.from("task_tags").insert({ task_id, tag_id });
      if (error) throw error;
    },
    onMutate: async ({ task_id, tag_id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === task_id ? { ...t, task_tags: [...(t.task_tags || []), { tag_id }] } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const removeTaskTag = useMutation({
    mutationFn: async ({ task_id, tag_id }: { task_id: string; tag_id: string }) => {
      const { error } = await supabase.from("task_tags").delete().eq("task_id", task_id).eq("tag_id", tag_id);
      if (error) throw error;
    },
    onMutate: async ({ task_id, tag_id }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const snap = snapshotTasks(qc);
      updateAllTaskCaches(qc, (tasks) =>
        tasks.map(t => t.id === task_id ? { ...t, task_tags: t.task_tags?.filter(tt => tt.tag_id !== tag_id) } : t)
      );
      return { snap };
    },
    onError: (_e, _v, ctx) => { if (ctx?.snap) restoreTasks(qc, ctx.snap); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // Helper: ensure user is also member of parent project when added to subproject
  // Uses 'viewer' role — navigation only, no access to other subprojects
  const ensureParentMembership = async (groupId: string, targetUserId: string) => {
    const { data: group } = await supabase.from("task_groups").select("parent_id").eq("id", groupId).single();
    if (!group?.parent_id) return;
    const { data: existing } = await supabase
      .from("group_members").select("id, role").eq("group_id", group.parent_id).eq("user_id", targetUserId).maybeSingle();
    if (!existing) {
      await supabase.from("group_members").insert({
        group_id: group.parent_id, user_id: targetUserId, invited_by: user!.id, role: "viewer",
      });
    }
  };

  // ========== GROUP MEMBERS ==========

  const addGroupMember = useMutation({
    mutationFn: async ({ group_id, user_id: memberId, role = "participant" }: { group_id: string; user_id?: string; user_email?: string; role?: string }) => {
      let targetUserId = memberId;
      if (!targetUserId) throw new Error("user_id is required");

      const { data: existing } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", group_id)
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existing) throw new Error("Пользователь уже в проекте");

      const { error } = await supabase.from("group_members").insert({
        group_id, user_id: targetUserId, invited_by: user!.id, role,
      });
      if (error) throw error;

      // Auto-add to parent project if this is a subproject
      await ensureParentMembership(group_id, targetUserId);

      // Notify: added to group
      const { data: groupInfo } = await supabase.from("task_groups").select("name").eq("id", group_id).single();
      notifyEvent("added_to_group", groupInfo?.name || "Проект", [targetUserId]);

      const { data: group } = await supabase.from("task_groups").select("*").eq("id", group_id).single();
      if (group && group.linked_tag_id) {
        await supabase.from("tag_access").insert({ tag_id: group.linked_tag_id, user_id: targetUserId, granted_by: user!.id });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group_members"] }); toast.success("Участник добавлен"); },
    onError: (e) => toast.error(e.message),
  });

  const addGroupMemberByEmail = useMutation({
    mutationFn: async ({ group_id, user_email, role = "participant" }: { group_id: string; user_email: string; role?: string }) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("id").eq("email", user_email).single();
      if (profileError) throw new Error("Пользователь не найден");

      const { error } = await supabase.from("group_members").insert({
        group_id, user_id: profile.id, invited_by: user!.id, role,
      });
      if (error) throw error;

      // Auto-add to parent project if this is a subproject
      await ensureParentMembership(group_id, profile.id);

      // Notify: added to group
      const { data: groupInfo } = await supabase.from("task_groups").select("name").eq("id", group_id).single();
      notifyEvent("added_to_group", groupInfo?.name || "Проект", [profile.id]);

      const { data: group } = await supabase.from("task_groups").select("*").eq("id", group_id).single();
      if (group && group.linked_tag_id) {
        await supabase.from("tag_access").insert({ tag_id: group.linked_tag_id, user_id: profile.id, granted_by: user!.id });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group_members"] }); toast.success("Участник добавлен"); },
    onError: (e) => toast.error(e.message),
  });

  const removeGroupMember = useMutation({
    mutationFn: async ({ group_id, member_user_id }: { group_id: string; member_user_id: string }) => {
      const { error } = await supabase.from("group_members").delete().eq("group_id", group_id).eq("user_id", member_user_id);
      if (error) throw error;
    },
    onMutate: async ({ group_id, member_user_id }) => {
      await qc.cancelQueries({ queryKey: ["group_members", group_id] });
      const prev = qc.getQueryData<any[]>(["group_members", group_id]);
      qc.setQueryData(["group_members", group_id], (old: any[] | undefined) =>
        old?.filter((m: any) => m.user_id !== member_user_id)
      );
      return { prev, group_id };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["group_members", ctx.group_id], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["group_members"] }),
  });

  const updateGroupMemberRole = useMutation({
    mutationFn: async ({ group_id, member_user_id, role }: { group_id: string; member_user_id: string; role: string }) => {
      const { error } = await supabase.from("group_members").update({ role }).eq("group_id", group_id).eq("user_id", member_user_id);
      if (error) throw error;
    },
    onMutate: async ({ group_id, member_user_id, role }) => {
      await qc.cancelQueries({ queryKey: ["group_members", group_id] });
      const prev = qc.getQueryData<any[]>(["group_members", group_id]);
      qc.setQueryData(["group_members", group_id], (old: any[] | undefined) =>
        old?.map((m: any) => m.user_id === member_user_id ? { ...m, role } : m)
      );
      return { prev, group_id };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["group_members", ctx.group_id], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["group_members"] }),
  });

  // ========== PARTICIPANTS ==========

  const addParticipant = useMutation({
    mutationFn: async ({ task_id, user_id: participantUserId, role }: { task_id: string; user_id: string; role: string }) => {
      // Use upsert so existing participants can be promoted to assignee
      const { error } = await supabase.from("task_participants" as any).upsert(
        { task_id, user_id: participantUserId, role },
        { onConflict: "task_id,user_id" }
      );
      if (error) throw error;
      if (role === "assignee") {
        await supabase.from("tasks").update({ assigned_to: participantUserId }).eq("id", task_id);
      }

      // Auto-add participant to project group_members if not already a member
      const { data: taskData } = await supabase.from("tasks").select("title, group_id").eq("id", task_id).single();
      if (taskData?.group_id) {
        const { data: existing } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", taskData.group_id)
          .eq("user_id", participantUserId)
          .maybeSingle();
        if (!existing) {
          await supabase.from("group_members").insert({
            group_id: taskData.group_id,
            user_id: participantUserId,
            role: "participant",
            invited_by: user!.id,
          });
          // Auto-add to parent project
          await ensureParentMembership(taskData.group_id, participantUserId);
        }
      }

      // Notify participant
      const event = role === "assignee" ? "task_assigned" : "task_participant_added";
      notifyEvent(event, taskData?.title || "", [participantUserId], task_id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task_participants"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["task_groups"] }); },
    onError: (e) => toast.error(e.message),
  });

  const removeParticipant = useMutation({
    mutationFn: async ({ task_id, user_id }: { task_id: string; user_id: string }) => {
      const { error } = await supabase.from("task_participants" as any).delete().eq("task_id", task_id).eq("user_id", user_id);
      if (error) throw error;
      const { data: remaining } = await supabase.from("task_participants" as any).select("*").eq("task_id", task_id).eq("role", "assignee");
      if (!remaining || remaining.length === 0) {
        await supabase.from("tasks").update({ assigned_to: null }).eq("id", task_id);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task_participants"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); },
    onError: (e) => toast.error(e.message),
  });

  const grantTagAccess = useMutation({
    mutationFn: async ({ tag_id, user_email }: { tag_id: string; user_email: string }) => {
      const { data: profile, error: profileError } = await supabase
        .from("profiles").select("id").eq("email", user_email).single();
      if (profileError) throw new Error("Пользователь не найден");
      const { error } = await supabase.from("tag_access" as any).insert({ tag_id, user_id: profile.id, granted_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Доступ предоставлен"),
    onError: (e) => toast.error(e.message),
  });

  // ========== PROJECT FOLDERS ==========

  const addProjectFolder = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data: existing } = await supabase.from("project_folders" as any).select("position").order("position", { ascending: false }).limit(1);
      const maxPos = (existing as any)?.[0]?.position ?? -1;
      const { error } = await supabase.from("project_folders" as any).insert({ name, user_id: user!.id, position: maxPos + 1 });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project_folders"] }); },
    onError: (e) => toast.error(e.message),
  });

  const renameProjectFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("project_folders" as any).update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_folders"] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteProjectFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_folders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["project_folders"] }); qc.invalidateQueries({ queryKey: ["project_folder_items"] }); },
    onError: (e) => toast.error(e.message),
  });

  const moveProjectToFolder = useMutation({
    mutationFn: async ({ group_id, folder_id }: { group_id: string; folder_id: string | null }) => {
      // Remove existing mapping
      await supabase.from("project_folder_items" as any).delete().eq("group_id", group_id).eq("user_id", user!.id);
      // If folder_id provided, add new mapping
      if (folder_id) {
        const { data: existing } = await supabase.from("project_folder_items" as any).select("position").eq("folder_id", folder_id).order("position", { ascending: false }).limit(1);
        const maxPos = (existing as any)?.[0]?.position ?? -1;
        const { error } = await supabase.from("project_folder_items" as any).insert({ folder_id, group_id, user_id: user!.id, position: maxPos + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_folder_items"] }),
    onError: (e) => toast.error(e.message),
  });

  const updateFolderColor = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string }) => {
      const { error } = await supabase.from("project_folders" as any).update({ color }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_folders"] }),
    onError: (e) => toast.error(e.message),
  });

  // ========== GROUP TAGS ==========

  const addGroupTag = useMutation({
    mutationFn: async ({ group_id, tag_id }: { group_id: string; tag_id: string }) => {
      const { error } = await supabase.from("group_tags" as any).insert({ group_id, tag_id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["group_tags", vars.group_id] }),
    onError: (e) => toast.error(e.message),
  });

  const removeGroupTag = useMutation({
    mutationFn: async ({ group_id, tag_id }: { group_id: string; tag_id: string }) => {
      const { error } = await supabase.from("group_tags" as any).delete().eq("group_id", group_id).eq("tag_id", tag_id);
      if (error) throw error;
    },
    onMutate: async ({ group_id, tag_id }) => {
      await qc.cancelQueries({ queryKey: ["group_tags", group_id] });
      const prev = qc.getQueryData<{ tag_id: string }[]>(["group_tags", group_id]);
      qc.setQueryData(["group_tags", group_id], (old: { tag_id: string }[] | undefined) =>
        old?.filter(gt => gt.tag_id !== tag_id)
      );
      return { prev, group_id };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["group_tags", ctx.group_id], ctx.prev); },
    onSettled: (_d, _e, vars) => qc.invalidateQueries({ queryKey: ["group_tags", vars.group_id] }),
  });

  // ========== TAG CATEGORIES ==========

  const addTagCategory = useMutation({
    mutationFn: async ({ name, color, parent_id }: { name: string; color?: string; parent_id?: string | null }) => {
      const { data: existing } = await supabase.from("tag_categories" as any).select("position").order("position", { ascending: false }).limit(1);
      const pos = ((existing as any)?.[0]?.position ?? -1) + 1;
      const { error } = await supabase.from("tag_categories" as any).insert({ name, color: color || "#6366f1", user_id: user!.id, position: pos, parent_id: parent_id || null });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tag_categories"] }),
  });

  const renameTagCategory = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("tag_categories" as any).update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tag_categories"] }),
  });

  const deleteTagCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tag_categories" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["tag_categories"] }); qc.invalidateQueries({ queryKey: ["tags"] }); },
  });

  const updateTagCategory = useMutation({
    mutationFn: async ({ tag_id, category_id }: { tag_id: string; category_id: string | null }) => {
      const { error } = await supabase.from("tags").update({ category_id } as any).eq("id", tag_id);
      if (error) throw error;
    },
    onMutate: async ({ tag_id, category_id }) => {
      await qc.cancelQueries({ queryKey: ["tags"] });
      const prev = qc.getQueryData<Tag[]>(["tags", user?.id]);
      qc.setQueryData<Tag[]>(["tags", user?.id], (old) => old?.map(t => t.id === tag_id ? { ...t, category_id } : t));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["tags", user?.id], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });

  // ========== SUBTASK TRANSFERS ==========

  /** Promote subtask to a standalone task in the same project */
  const promoteSubtaskToTask = useMutation({
    mutationFn: async ({ subtaskId }: { subtaskId: string }) => {
      const { data: sub, error: subErr } = await supabase.from("subtasks").select("*").eq("id", subtaskId).single();
      if (subErr || !sub) throw subErr || new Error("Subtask not found");

      const { data: parentTask } = await supabase.from("tasks").select("group_id, user_id").eq("id", sub.task_id).single();

      // Create new task from subtask
      const { error: taskErr } = await supabase.from("tasks").insert({
        title: sub.title,
        user_id: user!.id,
        group_id: parentTask?.group_id || null,
        deadline: sub.deadline,
        assigned_to: sub.assigned_to,
        is_completed: sub.is_completed,
        completed_at: sub.is_completed ? new Date().toISOString() : null,
      });
      if (taskErr) throw taskErr;

      // Delete the subtask
      await supabase.from("subtasks").delete().eq("id", subtaskId);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onSuccess: () => toast.success("Шаг повышен до задачи"),
    onError: () => toast.error("Не удалось повысить шаг"),
  });

  /** Demote a task to subtask of another task */
  const demoteTaskToSubtask = useMutation({
    mutationFn: async ({ taskId, targetTaskId }: { taskId: string; targetTaskId: string }) => {
      const { data: task, error: tErr } = await supabase.from("tasks").select("*").eq("id", taskId).single();
      if (tErr || !task) throw tErr || new Error("Task not found");

      // Count existing subtasks for position
      const { count } = await supabase.from("subtasks").select("id", { count: "exact", head: true }).eq("task_id", targetTaskId);

      // Create subtask from task
      const { error: subErr } = await supabase.from("subtasks").insert({
        task_id: targetTaskId,
        title: task.title,
        is_completed: task.is_completed,
        deadline: task.deadline,
        assigned_to: task.assigned_to,
        position: (count || 0),
      });
      if (subErr) throw subErr;

      // Delete original task (and its subtasks cascade)
      await supabase.from("tasks").delete().eq("id", taskId);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onSuccess: () => toast.success("Задача понижена до шага"),
    onError: () => toast.error("Не удалось понизить задачу"),
  });

  /** Move subtask to another task */
  const moveSubtaskToTask = useMutation({
    mutationFn: async ({ subtaskId, targetTaskId }: { subtaskId: string; targetTaskId: string }) => {
      const { count } = await supabase.from("subtasks").select("id", { count: "exact", head: true }).eq("task_id", targetTaskId);
      const { error } = await supabase.from("subtasks").update({
        task_id: targetTaskId,
        position: (count || 0),
      }).eq("id", subtaskId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onSuccess: () => toast.success("Шаг перемещён в другую задачу"),
    onError: () => toast.error("Не удалось переместить шаг"),
  });

  return {
    addGroup, renameGroup, deleteGroup, updateGroupAppearance, updateGroupDescription, updateGroupParent, updateGroupProjectType, closeProject,
    updateBaselineSettings, lockBaseline, unlockBaseline,
    addTask, updateTask, deleteTask, toggleTask, toggleImportant,
    submitForApproval, approveTask, rejectTask,
    addSubtask, toggleSubtask, deleteSubtask, updateSubtask, reorderSubtasks,
    promoteSubtaskToTask, demoteTaskToSubtask, moveSubtaskToTask,
    addTag, renameTag, deleteTag, addTaskTag, removeTaskTag,
    addGroupMember, addGroupMemberByEmail, removeGroupMember, updateGroupMemberRole, grantTagAccess,
    reorderTasks, reorderGroups,
    addParticipant, removeParticipant,
    addProjectFolder, renameProjectFolder, deleteProjectFolder, moveProjectToFolder, updateFolderColor,
    addGroupTag, removeGroupTag,
    addTagCategory, renameTagCategory, deleteTagCategory, updateTagCategory,
  };
}
