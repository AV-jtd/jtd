// СОБРАНО скриптом scripts/build-assistant-function.mjs — руками не править.
// Источник: src/lib/assistant/edge.ts и общий реестр src/lib/mcp/registry.ts.
// Пересобирается на каждом npm run build.
// src/lib/assistant/edge.ts
import process11 from "node:process";
import { createClient as createClient11 } from "npm:@supabase/supabase-js@^2.95.3";

// src/lib/assistant/toolLayer.ts
import { z as z34 } from "npm:zod@^4.4.3";

// src/lib/mcp/tools/list_tasks.ts
import process from "node:process";
import { createClient } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z } from "npm:zod@^4.4.3";

// src/lib/mcp/tools/_names.ts
async function resolveNames(supabase, rows) {
  const ids = (key) => [...new Set(rows.map((r) => r[key]).filter((v) => !!v))];
  const groupIds = ids("group_id");
  const clientIds = ids("client_id");
  const userIds = ids("assigned_to");
  const [groups, clients, profiles] = await Promise.all([
    groupIds.length ? supabase.from("task_groups").select("id,name").in("id", groupIds) : Promise.resolve({ data: [] }),
    clientIds.length ? supabase.from("clients").select("id,name").in("id", clientIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("id,display_name").in("id", userIds) : Promise.resolve({ data: [] })
  ]);
  const list = (r) => r.data ?? [];
  return {
    project: new Map(
      list(groups).map((g) => [g.id, g.name])
    ),
    client: new Map(
      list(clients).map((c) => [c.id, c.name])
    ),
    person: new Map(
      list(profiles).map((p) => [p.id, p.display_name])
    )
  };
}
function shapeTask(t, names) {
  return {
    id: t.id,
    title: t.title,
    deadline: t.deadline,
    is_completed: t.is_completed,
    is_important: t.is_important,
    priority: t.priority,
    project_id: t.group_id,
    project_name: t.group_id ? names.project.get(t.group_id) ?? null : null,
    client_id: t.client_id,
    client_name: t.client_id ? names.client.get(t.client_id) ?? null : null,
    assigned_to: t.assigned_to,
    assigned_to_name: t.assigned_to ? names.person.get(t.assigned_to) ?? null : null
  };
}

// src/lib/mcp/tools/list_tasks.ts
function db(ctx) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var list_tasks_default = defineTool({
  name: "list_tasks",
  title: "\u0421\u043F\u0438\u0441\u043E\u043A \u0437\u0430\u0434\u0430\u0447",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u0442\u0435\u043A\u0443\u0449\u0435\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F JustTODOit. \u041C\u043E\u0436\u043D\u043E \u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432\u0430\u0442\u044C: overdue (\u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u044B), today (\u0434\u0435\u0434\u043B\u0430\u0439\u043D \u0441\u0435\u0433\u043E\u0434\u043D\u044F), this_week (\u043D\u0430 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0435), by project_id, assignee_me (\u044F \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C), status. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u2014 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438. \u0412 \u043E\u0442\u0432\u0435\u0442\u0435 \u0435\u0441\u0442\u044C total (\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u0441\u0435\u0433\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440) \u0438 has_more: \u0435\u0441\u043B\u0438 has_more=true, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435 \u0432\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 offset \u0438\u043B\u0438 \u0441\u0443\u0437\u044C\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440. \u041D\u0415 \u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u0432\u044B\u0432\u043E\u0434\u043E\u0432 \u043E \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435 \u043F\u043E \u0434\u043B\u0438\u043D\u0435 \u0441\u043F\u0438\u0441\u043A\u0430 \u2014 \u0441\u0432\u0435\u0440\u044F\u0439\u0442\u0435\u0441\u044C \u0441 total.",
  inputSchema: {
    filter: z.enum(["overdue", "today", "this_week", "all_open"]).optional().describe("\u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u0444\u0438\u043B\u044C\u0442\u0440 \u043F\u043E \u0441\u0440\u043E\u043A\u0430\u043C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E all_open."),
    project_id: z.string().uuid().optional().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id)."),
    assignee_me: z.boolean().optional().describe("\u0422\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447\u0438, \u0433\u0434\u0435 \u044F \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C (assigned_to = me)."),
    include_completed: z.boolean().optional().describe("\u0412\u043A\u043B\u044E\u0447\u0430\u0442\u044C \u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438."),
    limit: z.number().int().min(1).max(200).optional().describe("\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u0437\u0430\u0434\u0430\u0447 \u0432 \u043E\u0442\u0432\u0435\u0442\u0435. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 50."),
    offset: z.number().int().min(0).optional().describe("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u0414\u043B\u044F \u043F\u043E\u0441\u0442\u0440\u0430\u043D\u0438\u0447\u043D\u043E\u0433\u043E \u043E\u0431\u0445\u043E\u0434\u0430, \u043A\u043E\u0433\u0434\u0430 has_more=true.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    }
    const supabase = db(ctx);
    const uid = ctx.getUserId();
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = supabase.from("tasks").select(
      "id,title,description,deadline,start_at,is_completed,is_important,priority,status_meta,group_id,client_id,assigned_to,completed_at",
      { count: "exact" }
    ).order("deadline", { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);
    if (!input.include_completed) q = q.eq("is_completed", false);
    if (input.assignee_me) q = q.eq("assigned_to", uid);
    if (input.project_id) q = q.eq("group_id", input.project_id);
    const now = /* @__PURE__ */ new Date();
    const iso = (d) => d.toISOString();
    if (input.filter === "overdue") {
      q = q.lt("deadline", iso(now)).eq("is_completed", false);
    } else if (input.filter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      q = q.gte("deadline", iso(start)).lte("deadline", iso(end));
    } else if (input.filter === "this_week") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      q = q.gte("deadline", iso(start)).lte("deadline", iso(end));
    }
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const names = await resolveNames(supabase, data ?? []);
    const rows = (data ?? []).map((t) => shapeTask(t, names));
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    const text = hasMore ? `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u0437\u0430\u0434\u0430\u0447 \u0438\u0437 ${total} (\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${offset}). \u042D\u0442\u043E \u041D\u0415 \u0432\u0441\u0435: \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435, \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0441 offset=${offset + rows.length} \u0438\u043B\u0438 \u0441\u0443\u0437\u044C\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440.` : `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u0437\u0430\u0434\u0430\u0447 \u0438\u0437 ${total} \u2014 \u044D\u0442\u043E \u0432\u0441\u0435, \u0447\u0442\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440.`;
    return {
      content: [{ type: "text", text }],
      structuredContent: {
        tasks: rows,
        total,
        returned: rows.length,
        offset,
        has_more: hasMore
      }
    };
  }
});

// src/lib/mcp/tools/search_tasks.ts
import process2 from "node:process";
import { createClient as createClient2 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool2 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z2 } from "npm:zod@^4.4.3";
function db2(ctx) {
  return createClient2(process2.env.SUPABASE_URL, process2.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var SELECT = "id,title,description,deadline,is_completed,is_important,priority,group_id,client_id,assigned_to";
var search_tasks_default = defineTool2({
  name: "search_tasks",
  title: "\u041F\u043E\u0438\u0441\u043A \u0437\u0430\u0434\u0430\u0447 \u043F\u043E \u0442\u0435\u043A\u0441\u0442\u0443",
  description: "\u0418\u0449\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u043F\u043E \u043F\u043E\u0434\u0441\u0442\u0440\u043E\u043A\u0435 \u0432 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0438 \u0438 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0438. \u041D\u0443\u0436\u0435\u043D, \u0447\u0442\u043E\u0431\u044B \u0441\u0432\u0435\u0440\u0438\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u043E \u0438\u043B\u0438 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u0435 \u0441 \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u043C\u0438 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0438 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0434\u0443\u0431\u043B\u044C. \u0420\u0435\u0433\u0438\u0441\u0442\u0440 \u043D\u0435 \u0432\u0430\u0436\u0435\u043D. \u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 has_more: \u043F\u0440\u0438 true \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043E \u2014 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441. \u0422\u043E\u0447\u043D\u043E\u0435 \u043E\u0431\u0449\u0435\u0435 \u0447\u0438\u0441\u043B\u043E \u043D\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044F: \u043F\u043E\u0438\u0441\u043A \u0438\u0434\u0451\u0442 \u043F\u043E \u0434\u0432\u0443\u043C \u043F\u043E\u043B\u044F\u043C \u0438 \u043E\u0431\u044A\u0435\u0434\u0438\u043D\u044F\u0435\u0442 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F.",
  inputSchema: {
    query: z2.string().min(2).max(200).describe("\u041F\u043E\u0434\u0441\u0442\u0440\u043E\u043A\u0430 \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430 \u0432 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0438 \u0438 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0438. \u041D\u0435 \u043A\u043E\u0440\u043E\u0447\u0435 \u0434\u0432\u0443\u0445 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432."),
    include_completed: z2.boolean().optional().describe("\u0418\u0441\u043A\u0430\u0442\u044C \u0438 \u0441\u0440\u0435\u0434\u0438 \u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0445 \u0437\u0430\u0434\u0430\u0447. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u043D\u0435\u0442."),
    project_id: z2.string().uuid().optional().describe("\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0442\u044C \u043E\u0434\u043D\u0438\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C (task_groups.id)."),
    limit: z2.number().int().min(1).max(100).optional().describe("\u041C\u0430\u043A\u0441\u0438\u043C\u0443\u043C \u0437\u0430\u0434\u0430\u0447 \u0432 \u043E\u0442\u0432\u0435\u0442\u0435. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 30.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    }
    const supabase = db2(ctx);
    const limit = input.limit ?? 30;
    const escaped = input.query.replace(/[\\%_]/g, (m) => "\\" + m);
    const pattern = `%${escaped}%`;
    const base = (field) => {
      let q = supabase.from("tasks").select(SELECT).ilike(field, pattern).limit(limit);
      if (!input.include_completed) q = q.eq("is_completed", false);
      if (input.project_id) q = q.eq("group_id", input.project_id);
      return q;
    };
    const [byTitle, byDescription] = await Promise.all([base("title"), base("description")]);
    const failed = byTitle.error ?? byDescription.error;
    if (failed) return { content: [{ type: "text", text: failed.message }], isError: true };
    const seen = /* @__PURE__ */ new Set();
    const merged = [];
    for (const row of [...byTitle.data ?? [], ...byDescription.data ?? []]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    const hasMore = (byTitle.data?.length ?? 0) >= limit || (byDescription.data?.length ?? 0) >= limit;
    const rows = merged.slice(0, limit);
    const names = await resolveNames(supabase, rows);
    const shaped = rows.map((t) => shapeTask(t, names));
    const text = shaped.length === 0 ? `\u041F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB${input.query}\xBB \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E${input.include_completed ? "" : " \u0441\u0440\u0435\u0434\u0438 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0445 (\u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0435 \u043D\u0435 \u0438\u0441\u043A\u0430\u043B\u0438\u0441\u044C)"}.` : hasMore ? `\u041D\u0430\u0439\u0434\u0435\u043D\u043E \u0431\u043E\u043B\u044C\u0448\u0435, \u0447\u0435\u043C \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043E: ${shaped.length} \u0437\u0430\u0434\u0430\u0447 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB${input.query}\xBB. \u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0437\u0430\u043F\u0440\u043E\u0441 \u2014 \u044D\u0442\u043E \u041D\u0415 \u0432\u0441\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F.` : `\u041D\u0430\u0439\u0434\u0435\u043D\u043E ${shaped.length} \u0437\u0430\u0434\u0430\u0447 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB${input.query}\xBB \u2014 \u044D\u0442\u043E \u0432\u0441\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u044F.`;
    return {
      content: [{ type: "text", text }],
      structuredContent: {
        tasks: shaped,
        returned: shaped.length,
        has_more: hasMore,
        query: input.query,
        searched_completed: input.include_completed ?? false
      }
    };
  }
});

// src/lib/mcp/tools/get_task.ts
import process3 from "node:process";
import { createClient as createClient3 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool3 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z3 } from "npm:zod@^4.4.3";
function db3(ctx) {
  return createClient3(process3.env.SUPABASE_URL, process3.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var get_task_default = defineTool3({
  name: "get_task",
  title: "\u0417\u0430\u0434\u0430\u0447\u0430 \u2014 \u0434\u0435\u0442\u0430\u043B\u0438",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u043E\u0434\u0440\u043E\u0431\u043D\u0443\u044E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0437\u0430\u0434\u0430\u0447\u0438: \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435, \u0448\u0430\u0433\u0438 (\u043F\u043E\u0434\u0437\u0430\u0434\u0430\u0447\u0438), \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438, \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438.",
  inputSchema: { task_id: z3.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db3(ctx);
    const { data: task, error } = await supabase.from("tasks").select("*").eq("id", task_id).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!task) return { content: [{ type: "text", text: "\u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430" }], isError: true };
    const [{ data: steps }, { data: comments }, { data: participants }] = await Promise.all([
      supabase.from("subtasks").select("id,title,is_completed,deadline,assigned_to").eq("task_id", task_id).order("position"),
      // Таблица называется task_comments; с "comments" комментарии молча приходили пустыми.
      supabase.from("task_comments").select("id,content,kind,user_id,created_at").eq("task_id", task_id).order("created_at").limit(50),
      supabase.from("task_participants").select("user_id,role").eq("task_id", task_id)
    ]);
    return {
      content: [{ type: "text", text: `\u0417\u0430\u0434\u0430\u0447\u0430 \xAB${task.title}\xBB` }],
      structuredContent: { task, steps: steps ?? [], comments: comments ?? [], participants: participants ?? [] }
    };
  }
});

// src/lib/mcp/tools/create_task.ts
import { defineTool as defineTool4 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z4 } from "npm:zod@^4.4.3";

// src/lib/mcp/tools/_shared.ts
import process4 from "node:process";
import { createClient as createClient4 } from "npm:@supabase/supabase-js@^2.95.3";
function db4(ctx) {
  return createClient4(process4.env.SUPABASE_URL, process4.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var fail = (text) => ({ content: [{ type: "text", text }], isError: true });
async function notify(supabase, event, taskTitle, targetUserIds, taskId) {
  const targets = [...new Set(targetUserIds.filter(Boolean))];
  if (targets.length === 0) return;
  try {
    await supabase.functions.invoke("notify-event", {
      body: { event, taskTitle, targetUserIds: targets, taskId }
    });
  } catch {
  }
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveUser(supabase, who) {
  const q = who.trim();
  if (UUID_RE.test(q)) {
    const { data: data2 } = await supabase.from("profiles").select("id,display_name").eq("id", q).is("deleted_at", null).maybeSingle();
    return data2 ? { id: data2.id, name: data2.display_name ?? q } : { error: `\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C ${q} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D` };
  }
  const esc = q.replace(/[\\%_,()]/g, (m) => "\\" + m);
  const { data, error } = await supabase.from("profiles").select("id,display_name,email,work_email").is("deleted_at", null).or(`display_name.ilike.%${esc}%,email.ilike.%${esc}%,work_email.ilike.%${esc}%`).limit(6);
  if (error) return { error: error.message };
  const rows = data ?? [];
  const exact = rows.filter(
    (r) => [r.display_name, r.email, r.work_email].some((v) => v && v.toLowerCase() === q.toLowerCase())
  );
  const pick = exact.length === 1 ? exact : rows;
  if (pick.length === 1) return { id: pick[0].id, name: pick[0].display_name ?? pick[0].email ?? pick[0].id };
  if (pick.length === 0) return { error: `\u041D\u0438\u043A\u043E\u0433\u043E \u043D\u0435 \u043D\u0430\u0448\u043B\u043E\u0441\u044C \u043F\u043E \xAB${q}\xBB` };
  const list = pick.map((r) => `${r.display_name ?? "?"} <${r.work_email ?? r.email ?? "?"}> (${r.id})`).join("; ");
  return { error: `\u041F\u043E \xAB${q}\xBB \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u2014 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 id: ${list}` };
}
var STATUS_NAMES = ["\u0432 \u0440\u0430\u0431\u043E\u0442\u0435", "\u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E", "\u0436\u0434\u0451\u043C \u043E\u0442\u0432\u0435\u0442", "\u043F\u043E\u043B\u0443\u0447\u0435\u043D \u043E\u0442\u0432\u0435\u0442", "\u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", "\u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E"];
var plain = (s) => s.replace(/[^\p{L}\p{N} ]/gu, "").trim().toLowerCase().replace(/ё/g, "\u0435");
async function setStatus(supabase, userId, taskId, status) {
  const loadCategory = () => supabase.from("tag_categories").select("id").eq("system_key", "protocol_status").eq("is_system", true).limit(1).maybeSingle();
  let { data: cat } = await loadCategory();
  if (!cat) {
    await supabase.rpc("seed_protocol_status_for_user", { _user_id: userId });
    ({ data: cat } = await loadCategory());
  }
  if (!cat) return { error: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043D\u0430\u0439\u0442\u0438 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u0437\u0430\u0434\u0430\u0447" };
  const { data: tags, error } = await supabase.from("tags").select("id,name").eq("category_id", cat.id);
  if (error) return { error: error.message };
  const all = tags ?? [];
  const target = status === "none" ? null : all.find((t) => plain(t.name) === plain(status));
  if (status !== "none" && !target) return { error: `\u0421\u0442\u0430\u0442\u0443\u0441 \xAB${status}\xBB \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0441\u0440\u0435\u0434\u0438: ${all.map((t) => t.name).join(", ")}` };
  const toRemove = all.map((t) => t.id).filter((id) => id !== target?.id);
  if (toRemove.length) {
    const { error: e } = await supabase.from("task_tags").delete().eq("task_id", taskId).in("tag_id", toRemove);
    if (e) return { error: e.message };
  }
  if (target) {
    const { error: e } = await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: target.id }, { onConflict: "task_id,tag_id" });
    if (e) return { error: e.message };
    if (plain(target.name) === "\u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E") await mergeStatusMeta(supabase, taskId, { sent_at: (/* @__PURE__ */ new Date()).toISOString() }, true);
  }
  return { name: target?.name ?? null };
}
async function mergeStatusMeta(supabase, taskId, patch, onlyIfAbsent = false) {
  const { data, error } = await supabase.from("tasks").select("status_meta").eq("id", taskId).maybeSingle();
  if (error) return error.message;
  const cur = data?.status_meta ?? {};
  const next = onlyIfAbsent ? { ...patch, ...cur } : { ...cur, ...patch };
  const { error: e } = await supabase.from("tasks").update({ status_meta: next }).eq("id", taskId);
  return e ? e.message : null;
}
function nextRecurrence(from, rule) {
  const d = new Date(from);
  if (rule === "daily") d.setDate(d.getDate() + 1);
  else if (rule === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  } else if (rule === "every2days") d.setDate(d.getDate() + 2);
  else if (rule === "every3days") d.setDate(d.getDate() + 3);
  else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else if (rule === "biweekly") d.setDate(d.getDate() + 14);
  else if (rule === "monthly") d.setMonth(d.getMonth() + 1);
  else if (rule === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (rule === "semiannually") d.setMonth(d.getMonth() + 6);
  else if (rule === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d;
}
async function insertTask(supabase, uid, fields, opts = {}) {
  const { data, error } = await supabase.from("tasks").insert({
    user_id: uid,
    title: fields.title,
    description: fields.description ?? null,
    deadline: fields.deadline ?? null,
    group_id: fields.group_id ?? null,
    client_id: fields.client_id ?? null,
    assigned_to: fields.assigned_to,
    is_important: fields.is_important ?? false,
    priority: fields.priority ?? null,
    // Начало по умолчанию «сейчас» — как в приложении. План передаёт своё.
    start_at: fields.start_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    status_meta: fields.status_meta,
    ...fields.is_draft ? { is_draft: true } : {},
    ...fields.source_protocol_id ? { source_protocol_id: fields.source_protocol_id } : {},
    ...fields.protocol_scope ? { protocol_scope: fields.protocol_scope } : {}
  }).select("id,title,deadline,group_id,assigned_to").single();
  if (error) return { error: error.message };
  const warnings = [];
  const { error: pErr } = await supabase.from("task_participants").insert({ task_id: data.id, user_id: uid, role: "creator" });
  if (pErr) warnings.push(`\u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A-\u0441\u043E\u0437\u0434\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D: ${pErr.message}`);
  if (data.group_id) {
    const { data: group } = await supabase.from("task_groups").select("linked_tag_id").eq("id", data.group_id).maybeSingle();
    if (group?.linked_tag_id) {
      const { error: tErr } = await supabase.from("task_tags").insert({ task_id: data.id, tag_id: group.linked_tag_id });
      if (tErr) warnings.push(`\u0442\u0435\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0435 \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D: ${tErr.message}`);
    }
    if (!fields.is_draft) {
      const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", data.group_id);
      await notify(
        supabase,
        "new_task_in_group",
        data.title,
        (members ?? []).map((m) => m.user_id).filter((id) => id !== uid),
        data.id
      );
    }
  }
  if (!fields.is_draft && opts.notifyAssignee !== false && fields.assigned_to !== uid) {
    await notify(supabase, "task_assigned", data.title, [fields.assigned_to], data.id);
  }
  return { task: data, warnings };
}
function shouldKeepBaselineInStep(groupStatus, parentStatus) {
  return groupStatus === "planning" || parentStatus === "planning";
}
async function isPlanningPhase(supabase, groupId, cache = /* @__PURE__ */ new Map()) {
  if (!groupId) return false;
  const known = cache.get(groupId);
  if (known !== void 0) return known;
  const { data: group } = await supabase.from("task_groups").select("baseline_status,parent_id").eq("id", groupId).maybeSingle();
  let parentStatus = null;
  if (group?.parent_id && group.baseline_status !== "planning") {
    const { data: parent } = await supabase.from("task_groups").select("baseline_status").eq("id", group.parent_id).maybeSingle();
    parentStatus = parent?.baseline_status ?? null;
  }
  const answer = shouldKeepBaselineInStep(group?.baseline_status, parentStatus);
  cache.set(groupId, answer);
  return answer;
}

// src/lib/mcp/tools/create_task.ts
var create_task_default = defineTool4({
  name: "create_task",
  title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
  description: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u0437\u0430\u0434\u0430\u0447\u0443 \u0432 JustTODOit \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F. \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E title. \u0415\u0441\u043B\u0438 \u0437\u0430\u0434\u0430\u0447\u0430 \u0440\u043E\u0434\u0438\u043B\u0430\u0441\u044C \u0438\u0437 \u043F\u0438\u0441\u044C\u043C\u0430 \u2014 \u043F\u0435\u0440\u0435\u0434\u0430\u0439 source (\u0442\u0435\u043C\u0430, \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C, \u0434\u0430\u0442\u0430): \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u0442 \u043F\u043E\u043C\u0435\u0442\u043A\u0443 \xAB\u0441\u043E\u0437\u0434\u0430\u043D\u043E Claude\xBB \u0438 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u043F\u0438\u0441\u044C\u043C\u043E, \u043F\u043E \u043D\u0438\u043C \u043F\u043E\u0442\u043E\u043C \u0441\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u043F\u0438\u0441\u044C\u043C\u0430 \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438. assignee \u2014 \u043A\u0442\u043E \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u2014 \u0441\u0430\u043C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C). \u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u043E\u043B\u0443\u0447\u0430\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435, \u043A\u0430\u043A \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438.",
  inputSchema: {
    title: z4.string().min(1).max(500),
    description: z4.string().optional(),
    deadline: z4.string().optional().describe("ISO datetime, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 2026-08-15T18:00:00Z"),
    project_id: z4.string().uuid().optional(),
    client_id: z4.string().uuid().optional(),
    assignee: z4.string().optional().describe("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F"),
    assigned_to: z4.string().uuid().optional().describe("\u0423\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0435\u0435: \u0442\u043E \u0436\u0435, \u0447\u0442\u043E assignee \u0441 id"),
    is_important: z4.boolean().optional(),
    priority: z4.number().int().min(1).max(4).optional(),
    source: z4.object({
      kind: z4.enum(["email", "meeting", "chat", "other"]).default("email"),
      subject: z4.string().max(500).optional(),
      from: z4.string().max(300).optional().describe("\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C \u043F\u0438\u0441\u044C\u043C\u0430"),
      date: z4.string().optional().describe("\u0414\u0430\u0442\u0430 \u043F\u0438\u0441\u044C\u043C\u0430, ISO"),
      message_id: z4.string().max(500).optional().describe("Message-ID \u043F\u0438\u0441\u044C\u043C\u0430, \u0435\u0441\u043B\u0438 \u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D")
    }).optional().describe("\u041E\u0442\u043A\u0443\u0434\u0430 \u0437\u0430\u0434\u0430\u0447\u0430. \u0414\u043B\u044F \u0437\u0430\u0434\u0430\u0447 \u0438\u0437 \u043F\u043E\u0447\u0442\u044B \u2014 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    let assignee = { id: uid, name: "\u044F" };
    const who = input.assignee ?? input.assigned_to;
    if (who) {
      const r = await resolveUser(supabase, who);
      if ("error" in r) return fail(r.error);
      assignee = r;
    }
    const status_meta = {
      created_by: "claude",
      created_via: "mcp",
      ...input.source ? { source: { ...input.source, kind: input.source.kind ?? "email" } } : {}
    };
    const created = await insertTask(supabase, uid, {
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline ?? null,
      group_id: input.project_id ?? null,
      client_id: input.client_id ?? null,
      assigned_to: assignee.id,
      is_important: input.is_important ?? false,
      priority: input.priority ?? null,
      status_meta
    });
    if ("error" in created) return fail(created.error);
    const { task: data, warnings } = created;
    return {
      content: [{
        type: "text",
        text: `\u0421\u043E\u0437\u0434\u0430\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0430: ${data.title}${assignee.id !== uid ? ` \u2192 ${assignee.name}` : ""}` + (warnings.length ? `. \u041F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u044F: ${warnings.join("; ")}` : "")
      }],
      structuredContent: { task: data, assignee, ...warnings.length ? { warnings } : {} }
    };
  }
});

// src/lib/mcp/tools/complete_task.ts
import { defineTool as defineTool5 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z5 } from "npm:zod@^4.4.3";
var complete_task_default = defineTool5({
  name: "complete_task",
  title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
  description: "\u0417\u0430\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0443 \u2014 \u0442\u0430\u043A \u0436\u0435, \u043A\u0430\u043A \u043A\u043D\u043E\u043F\u043A\u0430 \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438. \u0415\u0441\u043B\u0438 \u0437\u0430\u0434\u0430\u0447\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F, \u043E\u043D\u0430 \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F, \u0430 \u0443\u0445\u043E\u0434\u0438\u0442 \u043D\u0430 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0449\u0438\u043A\u0443: \u0442\u043E\u0433\u0434\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D result \u2014 \u0447\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u043D\u043E. \u0423 \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0435\u0439\u0441\u044F \u0437\u0430\u0434\u0430\u0447\u0438 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F. \u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043F\u043E\u043B\u0443\u0447\u0430\u044E\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435.",
  inputSchema: {
    task_id: z5.string().uuid(),
    result: z5.string().max(4e3).optional().describe("\u0418\u0442\u043E\u0433 \u0440\u0430\u0431\u043E\u0442\u044B. \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D \u0434\u043B\u044F \u0437\u0430\u0434\u0430\u0447, \u0442\u0440\u0435\u0431\u0443\u044E\u0449\u0438\u0445 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, result }, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const { data: task, error: rErr } = await supabase.from("tasks").select("*").eq("id", task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("\u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
    if (task.is_completed) return { content: [{ type: "text", text: `\u0423\u0436\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u0430: ${task.title}` }], structuredContent: { task_id, already: true } };
    if (task.requires_approval && task.approval_status !== "approved") {
      if (task.approval_status === "pending") return fail(`\xAB${task.title}\xBB \u0443\u0436\u0435 \u0436\u0434\u0451\u0442 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F`);
      if (!result?.trim()) return fail(`\xAB${task.title}\xBB \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F: \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 result \u2014 \u0447\u0442\u043E \u0441\u0434\u0435\u043B\u0430\u043D\u043E. \u0417\u0430\u0434\u0430\u0447\u0430 \u0443\u0439\u0434\u0451\u0442 \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0449\u0438\u043A\u0443 \u043D\u0430 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435, \u0430 \u043D\u0435 \u0437\u0430\u043A\u0440\u043E\u0435\u0442\u0441\u044F.`);
      const { data: upd2, error: error2 } = await supabase.from("tasks").update({ approval_status: "pending", closure_result: result, closure_attachments: [] }).eq("id", task.id).select("id");
      if (error2) return fail(error2.message);
      if (!upd2?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438");
      await notify(supabase, "task_completed", `\u23F3 \u0417\u0430\u0434\u0430\u0447\u0430 \xAB${task.title}\xBB \u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F`, [task.user_id], task.id);
      return {
        content: [{ type: "text", text: `\xAB${task.title}\xBB \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 \u043D\u0430 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0449\u0438\u043A\u0443` }],
        structuredContent: { task_id, approval_status: "pending" }
      };
    }
    const { data: upd, error } = await supabase.from("tasks").update({ is_completed: true, completed_at: (/* @__PURE__ */ new Date()).toISOString(), ...result ? { closure_result: result } : {} }).eq("id", task.id).select("id");
    if (error) return fail(error.message);
    if (!upd?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438");
    let next = null;
    const warnings = [];
    if (task.recurrence && task.recurrence !== "none") {
      const nextDeadline = nextRecurrence(task.deadline ? new Date(task.deadline) : /* @__PURE__ */ new Date(), task.recurrence);
      if (!task.recurrence_end_date || nextDeadline <= new Date(task.recurrence_end_date)) {
        const { data: n, error: nErr } = await supabase.from("tasks").insert({
          title: task.title,
          description: task.description,
          group_id: task.group_id,
          user_id: task.user_id,
          is_important: task.is_important,
          deadline: nextDeadline.toISOString(),
          assigned_to: task.assigned_to,
          recurrence: task.recurrence,
          recurrence_end_date: task.recurrence_end_date,
          parent_recurring_id: task.parent_recurring_id || task.id,
          start_at: (/* @__PURE__ */ new Date()).toISOString()
        }).select("id,deadline").single();
        if (nErr) warnings.push(`\u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0430\u044F\u0441\u044F \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0430: ${nErr.message}`);
        else next = n;
      }
    }
    const { data: participants } = await supabase.from("task_participants").select("user_id").eq("task_id", task.id);
    await notify(supabase, "task_completed", task.title, (participants ?? []).map((p) => p.user_id), task.id);
    return {
      content: [{
        type: "text",
        text: `\u0417\u0430\u043A\u0440\u044B\u0442\u0430: ${task.title}` + (next ? `. \u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0430\u044F\u0441\u044F \u2014 \u043D\u0430 ${next.deadline?.slice(0, 10)}` : "") + (warnings.length ? `. ${warnings.join("; ")}` : "")
      }],
      structuredContent: { task_id, ...next ? { next_task: next } : {}, ...warnings.length ? { warnings } : {} }
    };
  }
});

// src/lib/mcp/tools/update_task_deadline.ts
import { defineTool as defineTool6 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z6 } from "npm:zod@^4.4.3";
var update_task_deadline_default = defineTool6({
  name: "update_task_deadline",
  title: "\u0421\u0434\u0432\u0438\u043D\u0443\u0442\u044C \u0434\u0435\u0434\u043B\u0430\u0439\u043D",
  description: "\u041C\u0435\u043D\u044F\u0435\u0442 \u0441\u0440\u043E\u043A \u043E\u0434\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438. \u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u041D\u0415 \u0434\u0432\u0438\u0433\u0430\u044E\u0442\u0441\u044F \u2014 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0430 \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u0445\u0432\u043E\u0441\u0442\u043E\u043C \u0435\u0441\u0442\u044C move_task (\u0438 preview_shift, \u0447\u0442\u043E\u0431\u044B \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C). \u041F\u043E\u043A\u0430 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D, \u0431\u0430\u0437\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430 \u0438\u0434\u0451\u0442 \u0437\u0430 \u0441\u0440\u043E\u043A\u043E\u043C, \u0438 \u0441\u0434\u0432\u0438\u0433 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F; \u043F\u043E\u0441\u043B\u0435 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438 \u0440\u0430\u0437\u043D\u0438\u0446\u0430 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435\u043C \u043E\u0442 \u043F\u043B\u0430\u043D\u0430.",
  inputSchema: {
    task_id: z6.string().uuid(),
    deadline: z6.string().describe("\u041D\u043E\u0432\u044B\u0439 \u0441\u0440\u043E\u043A, ISO datetime")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, deadline }, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const d = new Date(deadline);
    if (Number.isNaN(d.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${deadline}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
    const year = d.getUTCFullYear();
    if (year < 2e3 || year > 2100) return fail(`\u0414\u0430\u0442\u0430 ${deadline} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).`);
    const { data: task, error: rErr } = await supabase.from("tasks").select("id,title,start_at,group_id").eq("id", task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("\u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432");
    if (task.start_at && new Date(task.start_at) > d) {
      return fail(`\u041D\u0430\u0447\u0430\u043B\u043E \u0437\u0430\u0434\u0430\u0447\u0438 (${task.start_at}) \u043F\u043E\u0437\u0436\u0435 \u043D\u043E\u0432\u043E\u0433\u043E \u0441\u0440\u043E\u043A\u0430 \u2014 \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0430\u0441\u044C \u0431\u044B \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0434\u043B\u0438\u043D\u044B.`);
    }
    const updates = { deadline: d.toISOString() };
    if (await isPlanningPhase(supabase, task.group_id)) updates.original_deadline = updates.deadline;
    const { data, error } = await supabase.from("tasks").update(updates).eq("id", task_id).select("id,title,deadline,original_deadline").maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438");
    return {
      content: [{ type: "text", text: `\u0421\u0440\u043E\u043A \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D: ${data.title} \u2192 ${data.deadline}` }],
      structuredContent: { task: data, baseline_moved_with_deadline: "original_deadline" in updates }
    };
  }
});

// src/lib/mcp/tools/list_projects.ts
import process5 from "node:process";
import { createClient as createClient5 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool7 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z7 } from "npm:zod@^4.4.3";
function db5(ctx) {
  return createClient5(process5.env.SUPABASE_URL, process5.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var list_projects_default = defineTool7({
  name: "list_projects",
  title: "\u0421\u043F\u0438\u0441\u043E\u043A \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432",
  description: "\u041F\u0440\u043E\u0435\u043A\u0442\u044B (task_groups), \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044E. work_mode: flow \u2014 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u043F\u043E\u0442\u043E\u043A \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0439 (\u0432\u0435\u0445\u0438 \u0438 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u0443\u0442\u044C \u043A \u043D\u0435\u043C\u0443 \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F, \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0442\u044C \u043F\u043E \u0432\u0438\u0441\u044F\u043A\u0430\u043C \u0438 \u043B\u044E\u0434\u044F\u043C), plan \u2014 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441 \u043F\u043B\u0430\u043D\u043E\u043C, null \u2014 \u043F\u0440\u0438\u0437\u043D\u0430\u043A \u043D\u0435 \u0437\u0430\u0434\u0430\u043D, \u043D\u0435 \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0439. \u041C\u043E\u0436\u043D\u043E \u043E\u0442\u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E \u0442\u0438\u043F\u0443 \u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u0443 \u0430\u0440\u0445\u0438\u0432\u0430. \u0412 \u043E\u0442\u0432\u0435\u0442\u0435 \u0435\u0441\u0442\u044C total \u0438 has_more: \u0435\u0441\u043B\u0438 has_more=true, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435 \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u2014 \u043D\u0435 \u0441\u0443\u0434\u0438\u0442\u0435 \u043E \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435 \u043F\u043E \u0434\u043B\u0438\u043D\u0435 \u0441\u043F\u0438\u0441\u043A\u0430.",
  inputSchema: {
    project_type: z7.enum(["standard", "npd", "crm", "protocol"]).optional(),
    include_archived: z7.boolean().optional(),
    limit: z7.number().int().min(1).max(200).optional(),
    offset: z7.number().int().min(0).optional().describe("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u0414\u043B\u044F \u043F\u043E\u0441\u0442\u0440\u0430\u043D\u0438\u0447\u043D\u043E\u0433\u043E \u043E\u0431\u0445\u043E\u0434\u0430, \u043A\u043E\u0433\u0434\u0430 has_more=true.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db5(ctx);
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    let q = supabase.from("task_groups").select("id,name,project_type,work_mode,client_id,parent_id,closed_at,description", { count: "exact" }).order("name").range(offset, offset + limit - 1);
    if (input.project_type) q = q.eq("project_type", input.project_type);
    if (!input.include_archived) q = q.is("closed_at", null);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return {
      content: [{ type: "text", text: hasMore ? `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0438\u0437 ${total} (\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${offset}). \u042D\u0442\u043E \u041D\u0415 \u0432\u0441\u0435: \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0441 offset=${offset + rows.length} \u0438\u043B\u0438 \u0441\u0443\u0437\u044C\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440.` : `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0438\u0437 ${total} \u2014 \u044D\u0442\u043E \u0432\u0441\u0435, \u0447\u0442\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440.` }],
      structuredContent: { projects: rows, total, returned: rows.length, offset, has_more: hasMore }
    };
  }
});

// src/lib/mcp/tools/get_project.ts
import process6 from "node:process";
import { createClient as createClient6 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool8 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z8 } from "npm:zod@^4.4.3";
function db6(ctx) {
  return createClient6(process6.env.SUPABASE_URL, process6.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var get_project_default = defineTool8({
  name: "get_project",
  title: "\u041F\u0440\u043E\u0435\u043A\u0442 \u2014 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430, \u043C\u0435\u0442\u0440\u0438\u043A\u0438 \u0438 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043E\u0431\u0441\u0443\u0436\u0434\u0435\u043D\u0438\u044F",
  description: "\u0414\u0435\u0442\u0430\u043B\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0430\u0433\u0440\u0435\u0433\u0430\u0442\u044B (\u0432\u0441\u0435\u0433\u043E \u0437\u0430\u0434\u0430\u0447, \u043E\u0442\u043A\u0440\u044B\u0442\u043E, \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E), \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0435 \u0432\u0435\u0445\u0438 \u0438 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0432 \u0447\u0430\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041C\u0435\u0442\u0440\u0438\u043A\u0438 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435, \u0430 \u043D\u0435 \u043F\u043E \u0432\u044B\u0431\u043E\u0440\u043A\u0435, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0438\u043C \u043C\u043E\u0436\u043D\u043E \u0432\u0435\u0440\u0438\u0442\u044C.",
  inputSchema: {
    project_id: z8.string().uuid(),
    messages_limit: z8.number().int().min(0).max(50).optional().describe("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0445 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0447\u0430\u0442\u0430 \u0432\u0435\u0440\u043D\u0443\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 10, 0 \u2014 \u043D\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0442\u044C.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ project_id, messages_limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db6(ctx);
    const msgLimit = messages_limit ?? 10;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const countOf = (build) => build(baseTasks());
    function baseTasks() {
      return supabase.from("tasks").select("id", { count: "exact", head: true }).eq("group_id", project_id);
    }
    const [
      { data: project, error: projectError },
      totalRes,
      openRes,
      overdueRes,
      milestonesRes,
      messagesRes
    ] = await Promise.all([
      supabase.from("task_groups").select("*").eq("id", project_id).maybeSingle(),
      countOf((q) => q),
      countOf((q) => q.eq("is_completed", false)),
      countOf((q) => q.eq("is_completed", false).lt("deadline", nowIso)),
      // Таблица называется project_milestones. Здесь стояло "milestones" —
      // такой таблицы нет, запрос всегда падал, а его ошибка не проверялась:
      // вехи молча приходили пустыми. Теперь ошибка видна в ответе.
      supabase.from("project_milestones").select("id,name,planned_date,actual_date,status").eq("group_id", project_id).order("planned_date", { nullsFirst: false }).limit(20),
      msgLimit > 0 ? supabase.from("group_messages").select("id,content,created_at,user_id,external_author,source").eq("group_id", project_id).order("created_at", { ascending: false }).limit(msgLimit) : Promise.resolve({ data: [], error: null })
    ]);
    if (projectError) return { content: [{ type: "text", text: projectError.message }], isError: true };
    if (!project) return { content: [{ type: "text", text: "\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430" }], isError: true };
    const total = totalRes.count ?? 0;
    const open = openRes.count ?? 0;
    const overdue = overdueRes.count ?? 0;
    const msgs = messagesRes.data ?? [];
    const names = await resolveNames(
      supabase,
      msgs.map((m) => ({ assigned_to: m.user_id }))
    );
    const warnings = [];
    if (milestonesRes.error) warnings.push(`\u0432\u0435\u0445\u0438 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u044B: ${milestonesRes.error.message}`);
    if (messagesRes.error) warnings.push(`\u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u044B: ${messagesRes.error.message}`);
    const head = `${project.name}: ${open} \u0438\u0437 ${total} \u043E\u0442\u043A\u0440\u044B\u0442\u043E, \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E ${overdue}`;
    const tail = warnings.length ? ` \u26A0\uFE0F ${warnings.join("; ")}` : "";
    return {
      content: [{ type: "text", text: head + tail }],
      structuredContent: {
        project,
        metrics: { total, open, completed: total - open, overdue },
        milestones: milestonesRes.data ?? [],
        recent_messages: msgs.map((m) => ({
          id: m.id,
          content: m.content,
          created_at: m.created_at,
          author: m.external_author ?? (m.user_id ? names.person.get(m.user_id) ?? null : null),
          source: m.source
        })),
        warnings
      }
    };
  }
});

// src/lib/mcp/tools/get_project_schedule.ts
import { defineTool as defineTool9 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z9 } from "npm:zod@^4.4.3";

// src/lib/drift.ts
import { differenceInDays } from "npm:date-fns@^3.6.0";
var MAX_REASONABLE_DRIFT_DAYS = 3650;
var MIN_PLAUSIBLE_YEAR = 2e3;
var MAX_PLAUSIBLE_YEAR = 2100;
function parsed(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < MIN_PLAUSIBLE_YEAR || y > MAX_PLAUSIBLE_YEAR) return null;
  return d;
}
function driftDays(originalDeadline, deadline) {
  const from = parsed(originalDeadline);
  const to = parsed(deadline);
  if (!from || !to) return null;
  const days = differenceInDays(to, from);
  if (Math.abs(days) > MAX_REASONABLE_DRIFT_DAYS) return null;
  return days;
}

// src/lib/criticalPath.ts
import { differenceInCalendarDays, parseISO } from "npm:date-fns@^3.6.0";
var DAY = 864e5;
function computeCriticalPath(nodesIn, linksIn) {
  const nodes = /* @__PURE__ */ new Map();
  for (const n of nodesIn) {
    if (!n.end) continue;
    const end = parseISO(n.end).getTime();
    if (Number.isNaN(end)) continue;
    const startRaw = n.start ? parseISO(n.start).getTime() : NaN;
    nodes.set(n.id, { id: n.id, start: Number.isNaN(startRaw) ? null : startRaw, end });
  }
  const links = linksIn.filter((l) => nodes.has(l.from) && nodes.has(l.to));
  const fs = links.filter((l) => l.type === "FS");
  const ignoredLinks = links.length - fs.length;
  if (nodes.size === 0) {
    return { nodes: [], critical_path: [], project_end: null, ignored_links: ignoredLinks, cycle: null };
  }
  const successors = /* @__PURE__ */ new Map();
  for (const l of fs) {
    if (!successors.has(l.from)) successors.set(l.from, []);
    successors.get(l.from).push(l);
  }
  const projectEnd = Math.max(...[...nodes.values()].map((n) => n.end));
  const lateFinish = /* @__PURE__ */ new Map();
  const state = /* @__PURE__ */ new Map();
  let cycle = null;
  const visit = (id, stack) => {
    const known = lateFinish.get(id);
    if (known !== void 0 && state.get(id) === "done") return known;
    if (state.get(id) === "visiting") {
      if (!cycle) cycle = [...stack.slice(stack.indexOf(id)), id];
      return projectEnd;
    }
    state.set(id, "visiting");
    const succ = successors.get(id) ?? [];
    let lf = projectEnd;
    for (const l of succ) {
      const s = nodes.get(l.to);
      const sLateFinish = visit(l.to, [...stack, id]);
      const sDuration = s.start !== null ? Math.max(0, Math.round((s.end - s.start) / DAY)) : 0;
      const sLateStart = sLateFinish - sDuration * DAY;
      lf = Math.min(lf, sLateStart - (l.lag_days || 0) * DAY);
    }
    lateFinish.set(id, lf);
    state.set(id, "done");
    return lf;
  };
  for (const id of nodes.keys()) visit(id, []);
  const results = [];
  for (const [id, n] of nodes) {
    const lf = lateFinish.get(id);
    const floatDays = differenceInCalendarDays(new Date(lf), new Date(n.end));
    results.push({ id, float_days: floatDays, critical: floatDays <= 0, late_finish: new Date(lf).toISOString() });
  }
  return {
    nodes: results,
    critical_path: longestCriticalChain(nodes, successors, results),
    project_end: new Date(projectEnd).toISOString(),
    ignored_links: ignoredLinks,
    cycle
  };
}
function longestCriticalChain(nodes, successors, results) {
  const critical = new Set(results.filter((r) => r.critical).map((r) => r.id));
  if (critical.size === 0) return [];
  const memo = /* @__PURE__ */ new Map();
  const walking = /* @__PURE__ */ new Set();
  const chainFrom = (id) => {
    const cached = memo.get(id);
    if (cached) return cached;
    if (walking.has(id)) return [id];
    walking.add(id);
    let best = [];
    for (const l of successors.get(id) ?? []) {
      if (!critical.has(l.to)) continue;
      const tail = chainFrom(l.to);
      if (tail.length > best.length) best = tail;
    }
    walking.delete(id);
    const chain = [id, ...best];
    memo.set(id, chain);
    return chain;
  };
  let longest = [];
  for (const id of critical) {
    const chain = chainFrom(id);
    if (chain.length > longest.length) longest = chain;
  }
  return longest.length > 1 ? longest : [];
}

// src/lib/progress.ts
function taskProgressPct(task) {
  const subs = task.subtasks ?? [];
  if (subs.length > 0) {
    const done = subs.filter((s) => s.is_completed).length;
    return Math.round(done / subs.length * 100);
  }
  return task.is_completed ? 100 : 0;
}
function projectProgressPct(tasks) {
  if (tasks.length === 0) return null;
  const sum = tasks.reduce((acc, t) => acc + taskProgressPct(t), 0);
  return Math.round(sum / tasks.length);
}

// src/lib/mcp/tools/get_project_schedule.ts
var MAX_TASKS = 300;
var get_project_schedule_default = defineTool9({
  name: "get_project_schedule",
  title: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0434\u043B\u044F \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440\u0430 \u043E \u0441\u0440\u043E\u043A\u0430\u0445: \u0432\u0435\u0445\u0438 \u0441 \u043F\u043B\u0430\u043D\u043E\u0432\u043E\u0439 \u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0434\u0430\u0442\u043E\u0439, \u0437\u0430\u0434\u0430\u0447\u0438 \u0441 \u043D\u0430\u0447\u0430\u043B\u043E\u043C \u0438 \u043A\u043E\u043D\u0446\u043E\u043C, \u0441\u0432\u044F\u0437\u0438 \u043C\u0435\u0436\u0434\u0443 \u043D\u0438\u043C\u0438 (\u0447\u0442\u043E \u0437\u0430 \u0447\u0435\u043C \u0438\u0434\u0451\u0442), \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u043E\u0442 \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430, \u0437\u0430\u043F\u0430\u0441 \u043F\u043E \u0441\u0440\u043E\u043A\u0430\u043C \u0438 \u0433\u043E\u0442\u043E\u0432\u043D\u043E\u0441\u0442\u044C \u0432 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u0430\u0445 (progress_pct \u2014 \u043F\u043E \u043F\u043E\u0434\u0437\u0430\u0434\u0430\u0447\u0430\u043C, \u043A\u0430\u043A \u043D\u0430 \u0413\u0430\u043D\u0442\u0435; \u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u2014 \u0441\u0440\u0435\u0434\u043D\u0435\u0435 \u043F\u043E \u0437\u0430\u0434\u0430\u0447\u0430\u043C). float_days \u2014 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u043D\u0435\u0439 \u043C\u043E\u0436\u043D\u043E \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u044C, \u043D\u0435 \u0441\u0434\u0432\u0438\u043D\u0443\u0432 \u0434\u0430\u0442\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430; critical \u2014 \u0437\u0430\u043F\u0430\u0441\u0430 \u043D\u0435\u0442, \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0430\u0442\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430; critical_path \u2014 \u0446\u0435\u043F\u043E\u0447\u043A\u0430, \u043A\u043E\u0442\u043E\u0440\u0430\u044F \u0435\u0451 \u0434\u0435\u0440\u0436\u0438\u0442. \u041D\u0443\u0436\u0435\u043D, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u0432\u0435\u0442\u0438\u0442\u044C \xAB\u0447\u0442\u043E \u0435\u0434\u0435\u0442 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435\xBB, \xAB\u0447\u0442\u043E \u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0430\u0442\u0443\xBB \u0438 \xAB\u0447\u0442\u043E \u0431\u0443\u0434\u0435\u0442, \u0435\u0441\u043B\u0438 \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u044C\xBB. \u0417\u0430\u0434\u0430\u0447 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044F \u043D\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 300 \u2014 \u043F\u0440\u0438 has_more \u0441\u0443\u0437\u044C\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 only_open, \u0438\u043D\u0430\u0447\u0435 \u0437\u0430\u043F\u0430\u0441 \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043D \u043F\u043E \u043D\u0435\u043F\u043E\u043B\u043D\u043E\u043C\u0443 \u0433\u0440\u0430\u0444\u0443.",
  inputSchema: {
    project_id: z9.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id)."),
    include_subprojects: z9.boolean().optional().describe("\u0412\u043A\u043B\u044E\u0447\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u043F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u0430 \u2014 \u0432 \u0413\u0430\u043D\u0442\u0435 \u043E\u043D\u0438 \u0432\u0438\u0434\u043D\u044B \u0432\u043C\u0435\u0441\u0442\u0435."),
    only_open: z9.boolean().optional().describe("\u0422\u043E\u043B\u044C\u043A\u043E \u043D\u0435\u0437\u0430\u043A\u0440\u044B\u0442\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u043D\u0435\u0442.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const withSubs = input.include_subprojects !== false;
    const { data: project, error: pErr } = await supabase.from("task_groups").select("id,name,closed_at,parent_id").eq("id", input.project_id).maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    let groupIds = [project.id];
    if (withSubs) {
      const { data: subs } = await supabase.from("task_groups").select("id,name").eq("parent_id", project.id);
      groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
    }
    const { data: milestones, error: mErr } = await supabase.from("project_milestones").select("id,group_id,name,planned_date,actual_date,status,gate_key").in("group_id", groupIds).order("planned_date", { ascending: true });
    if (mErr) return fail(mErr.message);
    let tq = supabase.from("tasks").select(
      "id,title,start_at,deadline,original_deadline,is_completed,completed_at,group_id,assigned_to,subtasks(is_completed)",
      { count: "exact" }
    ).in("group_id", groupIds).or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)").order("deadline", { ascending: true, nullsFirst: false }).limit(MAX_TASKS);
    if (input.only_open) tq = tq.eq("is_completed", false);
    const { data: tasks, error: tErr, count } = await tq;
    if (tErr) return fail(tErr.message);
    const rows = tasks ?? [];
    const names = await resolveNames(supabase, rows);
    const inScope = /* @__PURE__ */ new Set([...rows.map((t) => t.id), ...(milestones ?? []).map((m) => m.id)]);
    const ids = [...inScope];
    const CHUNK2 = 50;
    const seen = /* @__PURE__ */ new Set();
    const deps = [];
    for (let i = 0; i < ids.length; i += CHUNK2) {
      const chunk = ids.slice(i, i + CHUNK2);
      for (const column of ["predecessor_id", "successor_id"]) {
        const { data, error } = await supabase.from("task_dependencies").select("predecessor_id,successor_id,dependency_type,lag_days,predecessor_entity_type,successor_entity_type").in(column, chunk);
        if (error) return fail(error.message);
        for (const d of data ?? []) {
          const key = `${d.predecessor_id}>${d.successor_id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deps.push(d);
        }
      }
    }
    const label = /* @__PURE__ */ new Map();
    rows.forEach((t) => label.set(t.id, t.title));
    (milestones ?? []).forEach((m) => label.set(m.id, m.name));
    const links = deps.filter((d) => inScope.has(d.predecessor_id) && inScope.has(d.successor_id)).map((d) => ({
      from: d.predecessor_id,
      from_name: label.get(d.predecessor_id) ?? null,
      from_kind: d.predecessor_entity_type,
      to: d.successor_id,
      to_name: label.get(d.successor_id) ?? null,
      to_kind: d.successor_entity_type,
      type: d.dependency_type,
      lag_days: d.lag_days
    }));
    const cpm = computeCriticalPath(
      [
        ...rows.map((t) => ({ id: t.id, start: t.start_at, end: t.deadline })),
        ...(milestones ?? []).map((m) => ({ id: m.id, end: m.planned_date }))
      ],
      links.map((l) => ({ from: l.from, to: l.to, type: l.type, lag_days: l.lag_days }))
    );
    const slack = new Map(cpm.nodes.map((n) => [n.id, n]));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            project: { id: project.id, name: project.name, closed: !!project.closed_at },
            milestones: (milestones ?? []).map((m) => ({
              id: m.id,
              name: m.name,
              planned_date: m.planned_date,
              actual_date: m.actual_date,
              status: m.status,
              gate_key: m.gate_key,
              // Веха «уехала», если факт позже плана либо план уже прошёл.
              late_days: m.actual_date ? driftDays(m.planned_date, m.actual_date) : null,
              float_days: slack.get(m.id)?.float_days ?? null,
              critical: slack.get(m.id)?.critical ?? null
            })),
            tasks: rows.map((t) => ({
              id: t.id,
              title: t.title,
              start_at: t.start_at,
              deadline: t.deadline,
              is_completed: t.is_completed,
              assigned_to_name: t.assigned_to ? names.person.get(t.assigned_to) ?? null : null,
              project_name: t.group_id ? names.project.get(t.group_id) ?? null : null,
              // Отклонение от базового плана. null — либо не двигали, либо
              // базовая дата испорчена и числу верить нельзя.
              drift_days: driftDays(t.original_deadline, t.deadline),
              // Готовность: есть подзадачи — доля выполненных, иначе 0 или 100.
              progress_pct: taskProgressPct(t),
              // Запас: сколько дней можно сдвинуть, не сдвинув дату проекта.
              // null — у задачи нет срока, и места на шкале у неё нет.
              float_days: slack.get(t.id)?.float_days ?? null,
              critical: slack.get(t.id)?.critical ?? null
            })),
            dependencies: links,
            critical_path: cpm.critical_path.map((id) => ({ id, name: label.get(id) ?? null })),
            schedule: {
              project_end: cpm.project_end,
              // Связи не «финиш → старт» в расчёт запаса не вошли: считать их
              // приблизительно и не сказать — тот же способ разойтись молча,
              // каким разъехались дрифт и счётчики.
              links_ignored_in_slack: cpm.ignored_links,
              cycle: cpm.cycle ? cpm.cycle.map((id) => label.get(id) ?? id) : null
            },
            progress_pct: projectProgressPct(rows),
            counts: {
              milestones: (milestones ?? []).length,
              tasks_returned: rows.length,
              tasks_total: count ?? rows.length,
              has_more: (count ?? rows.length) > rows.length,
              dependencies: links.length
            }
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/create_milestone.ts
import { defineTool as defineTool10 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z10 } from "npm:zod@^4.4.3";
var MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "go",
  "no_go",
  "conditional",
  "completed",
  "missed"
];
var create_milestone_default = defineTool10({
  name: "create_milestone",
  title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0432\u0435\u0445\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u0432\u0435\u0445\u0443 (\u043A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0443\u044E \u0442\u043E\u0447\u043A\u0443) \u0432 \u043F\u0440\u043E\u0435\u043A\u0442\u0435. \u041E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u044B \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u043F\u0440\u043E\u0435\u043A\u0442 \u0438 \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430. \u0412\u0435\u0445\u0438 \u0432\u0438\u0434\u043D\u044B \u0432 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (get_project_schedule) \u0438 \u043D\u0430 \u0413\u0430\u043D\u0442\u0435. \u0421\u0442\u0430\u0442\u0443\u0441\u044B: pending \u2014 \u043E\u0436\u0438\u0434\u0430\u0435\u0442, in_progress \u2014 \u0432 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0435, go / no_go / conditional \u2014 \u0440\u0435\u0448\u0435\u043D\u0438\u044F \u0433\u0435\u0439\u0442\u0430, completed \u2014 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430, missed \u2014 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u0430.",
  inputSchema: {
    project_id: z10.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id)."),
    name: z10.string().min(1).max(300).describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0432\u0435\u0445\u0438."),
    planned_date: z10.string().describe("\u041F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430, ISO datetime. \u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440 2026-12-01T00:00:00Z."),
    description: z10.string().max(2e3).optional(),
    status: z10.enum(MILESTONE_STATUSES).optional().describe("\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E pending."),
    gate_key: z10.string().max(60).nullable().optional().describe("\u041A\u043B\u044E\u0447 \u0433\u0435\u0439\u0442\u0430 \u041D\u0418\u041E\u041A\u0420, \u0435\u0441\u043B\u0438 \u0432\u0435\u0445\u0430 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u0430 \u043A \u0433\u0435\u0439\u0442\u0443.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const planned = new Date(input.planned_date);
    if (Number.isNaN(planned.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${input.planned_date}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
    const year = planned.getUTCFullYear();
    if (year < 2e3 || year > 2100) return fail(`\u0414\u0430\u0442\u0430 ${input.planned_date} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).`);
    const { data: project, error: pErr } = await supabase.from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const { data: last } = await supabase.from("project_milestones").select("position").eq("group_id", input.project_id).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: created, error } = await supabase.from("project_milestones").insert({
      group_id: input.project_id,
      name: input.name,
      planned_date: planned.toISOString(),
      description: input.description ?? null,
      status: input.status ?? "pending",
      gate_key: input.gate_key ?? null,
      color: "#3b82f6",
      created_by: uid,
      position: (last?.position ?? 0) + 1
    }).select("id,name,planned_date,status").single();
    if (error) return fail(error.message);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            created: true,
            milestone: created,
            project: { id: project.id, name: project.name }
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/update_milestone.ts
import { defineTool as defineTool11 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z11 } from "npm:zod@^4.4.3";
var isoOrNull = z11.string().nullable().optional();
var update_milestone_default = defineTool11({
  name: "update_milestone",
  title: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0435\u0445\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u041C\u0435\u043D\u044F\u0435\u0442 \u0432\u0435\u0445\u0443: \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u043F\u043B\u0430\u043D\u043E\u0432\u0443\u044E \u0434\u0430\u0442\u0443, \u043E\u0442\u043C\u0435\u0447\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u0435 (actual_date), \u043C\u0435\u043D\u044F\u0435\u0442 \u0441\u0442\u0430\u0442\u0443\u0441, \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0438\u043B\u0438 \u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435. \u041F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u043E, \u0447\u0442\u043E \u043C\u0435\u043D\u044F\u0435\u0442\u0435 \u2014 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u0441\u0442\u0430\u043D\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u0435\u0441\u0442\u044C. \u0427\u0442\u043E\u0431\u044B \u043E\u0442\u043C\u0435\u0442\u0438\u0442\u044C \u0432\u0435\u0445\u0443 \u0434\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u043E\u0439, \u0437\u0430\u0434\u0430\u0439\u0442\u0435 actual_date \u0438 status=completed. \u0427\u0442\u043E\u0431\u044B \u0441\u043D\u044F\u0442\u044C \u043E\u0442\u043C\u0435\u0442\u043A\u0443 \u2014 actual_date=null.",
  inputSchema: {
    milestone_id: z11.string().uuid().describe("UUID \u0432\u0435\u0445\u0438 (project_milestones.id)."),
    name: z11.string().min(1).max(300).optional(),
    planned_date: z11.string().optional().describe("\u041D\u043E\u0432\u0430\u044F \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430, ISO datetime."),
    actual_date: isoOrNull.describe("\u0424\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0434\u0430\u0442\u0430 \u0434\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u044F, ISO datetime; null \u2014 \u0441\u043D\u044F\u0442\u044C \u043E\u0442\u043C\u0435\u0442\u043A\u0443."),
    status: z11.enum(MILESTONE_STATUSES).optional(),
    description: z11.string().max(2e3).nullable().optional(),
    gate_key: z11.string().max(60).nullable().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const { data: before, error: rErr } = await supabase.from("project_milestones").select("id,group_id,name,planned_date,actual_date,status").eq("id", input.milestone_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!before) return fail("\u0412\u0435\u0445\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
    const patch = {};
    for (const field of ["planned_date", "actual_date"]) {
      const raw = input[field];
      if (raw === void 0) continue;
      if (raw === null) {
        patch[field] = null;
        continue;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B ${field}: \xAB${raw}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
      const y = d.getUTCFullYear();
      if (y < 2e3 || y > 2100) return fail(`\u0414\u0430\u0442\u0430 ${raw} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).`);
      patch[field] = d.toISOString();
    }
    if (input.name !== void 0) patch.name = input.name;
    if (input.status !== void 0) patch.status = input.status;
    if (input.description !== void 0) patch.description = input.description;
    if (input.gate_key !== void 0) patch.gate_key = input.gate_key;
    if (Object.keys(patch).length === 0) return fail("\u041D\u0435\u0447\u0435\u0433\u043E \u043C\u0435\u043D\u044F\u0442\u044C: \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u043E\u043B\u044F");
    patch.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    const { data: after, error } = await supabase.from("project_milestones").update(patch).eq("id", input.milestone_id).select("id,name,planned_date,actual_date,status,gate_key").single();
    if (error) return fail(error.message);
    const shiftDays = input.planned_date !== void 0 && before.planned_date ? Math.round(
      (new Date(after.planned_date).getTime() - new Date(before.planned_date).getTime()) / 864e5
    ) : null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            updated: true,
            milestone: after,
            was: { planned_date: before.planned_date, actual_date: before.actual_date, status: before.status },
            planned_shift_days: shiftDays
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/link_tasks.ts
import { defineTool as defineTool12 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z12 } from "npm:zod@^4.4.3";

// src/lib/dependencyGraph.ts
import { parseISO as parseISO2, addDays, differenceInCalendarDays as differenceInCalendarDays2 } from "npm:date-fns@^3.6.0";
function wouldCreateCycle(predId, succId, existing) {
  if (predId === succId) return true;
  const adj = /* @__PURE__ */ new Map();
  for (const d of existing) {
    if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
    adj.get(d.predecessor_id).push(d.successor_id);
  }
  const visited = /* @__PURE__ */ new Set();
  const stack = [succId];
  while (stack.length) {
    const node = stack.pop();
    if (node === predId) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    const next = adj.get(node);
    if (next) stack.push(...next);
  }
  return false;
}
function resolveAllViolations(dependencies, entities, options = {}) {
  const updates = /* @__PURE__ */ new Map();
  const maxIter = options.maxIterations ?? 50;
  const adj = /* @__PURE__ */ new Map();
  for (const d of dependencies) {
    if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
    adj.get(d.predecessor_id).push(d);
  }
  const work = /* @__PURE__ */ new Map();
  entities.forEach((e, id) => work.set(id, { ...e }));
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (const d of dependencies) {
      const pred = work.get(d.predecessor_id);
      const succ = work.get(d.successor_id);
      if (!pred?.deadline || !succ) continue;
      const succAnchor = succ.start_at || succ.deadline;
      if (!succAnchor) continue;
      const predEnd = addDays(parseISO2(pred.deadline), d.lag_days || 0);
      const succStart = parseISO2(succAnchor);
      if (succStart >= predEnd) continue;
      let newStart = predEnd;
      let newDeadline;
      if (succ.start_at && succ.deadline) {
        const duration = differenceInCalendarDays2(parseISO2(succ.deadline), parseISO2(succ.start_at));
        newDeadline = addDays(newStart, Math.max(duration, 0));
      } else if (succ.deadline) {
        const gap = differenceInCalendarDays2(predEnd, succStart);
        newDeadline = addDays(parseISO2(succ.deadline), gap);
      } else {
        newDeadline = newStart;
      }
      const update = {
        start_at: newStart.toISOString(),
        deadline: newDeadline.toISOString()
      };
      updates.set(d.successor_id, update);
      work.set(d.successor_id, {
        id: d.successor_id,
        start_at: update.start_at,
        deadline: update.deadline
      });
      changed = true;
    }
    if (!changed) break;
  }
  return updates;
}

// src/lib/cascadeDependencies.ts
import { addDays as addDays2, parseISO as parseISO3, differenceInCalendarDays as differenceInCalendarDays3 } from "npm:date-fns@^3.6.0";
function computeCascadeUpdates(changedEntityId, newDeadline, oldDeadline, dependencies, entities) {
  const updates = /* @__PURE__ */ new Map();
  const daysDelta = differenceInCalendarDays3(newDeadline, oldDeadline);
  if (daysDelta === 0) return updates;
  const successorMap = /* @__PURE__ */ new Map();
  dependencies.forEach((d) => {
    if (!successorMap.has(d.predecessor_id)) successorMap.set(d.predecessor_id, []);
    successorMap.get(d.predecessor_id).push({
      successor_id: d.successor_id,
      dependency_type: d.dependency_type,
      lag_days: d.lag_days
    });
  });
  const visited = /* @__PURE__ */ new Set();
  const queue = [{ entityId: changedEntityId, pushDays: daysDelta }];
  const isForward = daysDelta > 0;
  while (queue.length > 0) {
    const { entityId, pushDays } = queue.shift();
    const succs = successorMap.get(entityId) || [];
    for (const succ of succs) {
      if (visited.has(succ.successor_id)) continue;
      visited.add(succ.successor_id);
      const entity = entities.get(succ.successor_id);
      if (!entity) continue;
      const effectivePush = isForward ? pushDays + succ.lag_days : pushDays;
      if (effectivePush === 0) continue;
      const update = {};
      if (entity.deadline) {
        update.deadline = addDays2(parseISO3(entity.deadline), effectivePush).toISOString();
      }
      if (entity.start_at) {
        update.start_at = addDays2(parseISO3(entity.start_at), effectivePush).toISOString();
      } else if (entity.deadline) {
        const newDeadlineDate = addDays2(parseISO3(entity.deadline), effectivePush);
        update.start_at = addDays2(newDeadlineDate, -1).toISOString();
      }
      if (update.deadline || update.start_at) {
        updates.set(succ.successor_id, update);
      }
      queue.push({ entityId: succ.successor_id, pushDays: effectivePush });
    }
  }
  return updates;
}

// src/lib/mcp/tools/_cascade.ts
var CHUNK = 50;
async function fetchDependencies(supabase) {
  const { data, error } = await supabase.from("task_dependencies").select("id,predecessor_id,successor_id,dependency_type,lag_days,predecessor_entity_type,successor_entity_type").limit(5e3);
  if (error) return { error: error.message };
  return data ?? [];
}
function dependencyComponent(deps, seeds) {
  const neighbours = /* @__PURE__ */ new Map();
  for (const d of deps) {
    if (!neighbours.has(d.predecessor_id)) neighbours.set(d.predecessor_id, []);
    if (!neighbours.has(d.successor_id)) neighbours.set(d.successor_id, []);
    neighbours.get(d.predecessor_id).push(d.successor_id);
    neighbours.get(d.successor_id).push(d.predecessor_id);
  }
  const seen = new Set(seeds);
  const stack = [...seeds];
  while (stack.length) {
    const id = stack.pop();
    for (const next of neighbours.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}
async function fetchByIds(supabase, table, columns, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.from(table).select(columns).in("id", ids.slice(i, i + CHUNK));
    if (error) return { error: error.message };
    out.push(...data ?? []);
  }
  return out;
}
async function cascade(supabase, deps, seeds, opts = {}) {
  const scope = await loadScope(supabase, deps, seeds);
  if ("error" in scope) return scope;
  if (scope.entities.size === 0) return { shifted: [] };
  const updates = resolveAllViolations(deps, scope.entities);
  return applyUpdates(supabase, scope, updates, opts);
}
async function loadScope(supabase, deps, seeds) {
  const ids = [...dependencyComponent(deps, seeds)];
  const s = {
    entities: /* @__PURE__ */ new Map(),
    createdAt: /* @__PURE__ */ new Map(),
    groupId: /* @__PURE__ */ new Map(),
    kind: /* @__PURE__ */ new Map(),
    name: /* @__PURE__ */ new Map(),
    was: /* @__PURE__ */ new Map()
  };
  if (ids.length === 0) return s;
  const tasks = await fetchByIds(supabase, "tasks", "id,title,start_at,deadline,created_at,group_id", ids);
  if ("error" in tasks) return tasks;
  const milestones = await fetchByIds(supabase, "project_milestones", "id,name,planned_date,created_at", ids);
  if ("error" in milestones) return milestones;
  for (const t of tasks) {
    s.entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline });
    s.createdAt.set(t.id, t.created_at);
    s.groupId.set(t.id, t.group_id);
    s.kind.set(t.id, "task");
    s.name.set(t.id, t.title);
    s.was.set(t.id, t.deadline);
  }
  for (const m of milestones) {
    s.entities.set(m.id, { id: m.id, deadline: m.planned_date });
    s.createdAt.set(m.id, m.created_at);
    s.kind.set(m.id, "milestone");
    s.name.set(m.id, m.name);
    s.was.set(m.id, m.planned_date);
  }
  return s;
}
async function applyUpdates(supabase, scope, updates, opts) {
  const shifted = [];
  const planningCache = /* @__PURE__ */ new Map();
  for (const [id, upd] of updates) {
    const what = scope.kind.get(id);
    if (!what) continue;
    if (what === "task") {
      const payload = {};
      if (upd.deadline) payload.deadline = upd.deadline;
      if (upd.start_at) payload.start_at = upd.start_at;
      if (Object.keys(payload).length === 0) continue;
      if (upd.deadline && await isPlanningPhase(supabase, scope.groupId.get(id), planningCache)) {
        payload.original_deadline = upd.deadline;
      }
      if (!opts.dryRun) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({
        id,
        kind: "task",
        name: scope.name.get(id),
        from: scope.was.get(id) ?? null,
        to: upd.deadline ?? upd.start_at
      });
    } else if (upd.deadline) {
      if (!opts.dryRun) {
        const { error } = await supabase.from("project_milestones").update({ planned_date: upd.deadline }).eq("id", id);
        if (error) return { error: error.message };
      }
      shifted.push({
        id,
        kind: "milestone",
        name: scope.name.get(id),
        from: scope.was.get(id) ?? null,
        to: upd.deadline
      });
    }
  }
  return { shifted };
}
async function moveWithCascade(supabase, id, newDeadline, opts = {}) {
  const deps = await fetchDependencies(supabase);
  if ("error" in deps) return deps;
  const scope = await loadScope(supabase, deps, [id]);
  if ("error" in scope) return scope;
  const kind = scope.kind.get(id) ?? await entityKind(supabase, id);
  if (!kind) return { error: "\u0417\u0430\u0434\u0430\u0447\u0430 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430, \u043B\u0438\u0431\u043E \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430" };
  if (!scope.entities.has(id)) {
    const table = kind === "task" ? "tasks" : "project_milestones";
    const columns = kind === "task" ? "id,title,start_at,deadline,created_at,group_id" : "id,name,planned_date,created_at";
    const { data, error } = await supabase.from(table).select(columns).eq("id", id).maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "\u0417\u0430\u0434\u0430\u0447\u0430 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430, \u043B\u0438\u0431\u043E \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430" };
    const row = data;
    scope.entities.set(id, {
      id,
      start_at: row.start_at ?? null,
      deadline: kind === "task" ? row.deadline ?? null : row.planned_date ?? null
    });
    scope.createdAt.set(id, row.created_at);
    scope.groupId.set(id, row.group_id ?? null);
    scope.kind.set(id, kind);
    scope.name.set(id, row.title ?? row.name);
    scope.was.set(id, kind === "task" ? row.deadline ?? null : row.planned_date ?? null);
  }
  const self = scope.entities.get(id);
  const oldDeadline = self.deadline;
  if (!oldDeadline) {
    return {
      error: "\u0423 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0435\u0442 \u0441\u0440\u043E\u043A\u0430, \u0438 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E: \u0441\u0434\u0432\u0438\u0433 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u043E\u0442 \u0441\u0442\u0430\u0440\u043E\u0439 \u0434\u0430\u0442\u044B \u043A \u043D\u043E\u0432\u043E\u0439. \u041F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0440\u043E\u043A \u0447\u0435\u0440\u0435\u0437 update_task."
    };
  }
  const shiftDays = Math.round((newDeadline.getTime() - new Date(oldDeadline).getTime()) / 864e5);
  if (shiftDays === 0) {
    return {
      error: "\u041D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u0441\u043E \u0441\u0442\u0430\u0440\u043E\u0439 \u2014 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E"
    };
  }
  const dateEntities = /* @__PURE__ */ new Map();
  scope.entities.forEach((e, eid) => {
    dateEntities.set(eid, {
      id: eid,
      deadline: e.deadline,
      start_at: e.start_at,
      created_at: scope.createdAt.get(eid) ?? (/* @__PURE__ */ new Date(0)).toISOString()
    });
  });
  const first = computeCascadeUpdates(id, newDeadline, new Date(oldDeadline), deps, dateEntities);
  const selfUpdate = { deadline: newDeadline.toISOString() };
  if (kind === "task" && self.start_at) {
    selfUpdate.start_at = new Date(new Date(self.start_at).getTime() + shiftDays * 864e5).toISOString();
  }
  const merged = /* @__PURE__ */ new Map([[id, selfUpdate]]);
  for (const [eid, upd] of first) merged.set(eid, upd);
  const firstPass = await applyUpdates(supabase, scope, merged, opts);
  if ("error" in firstPass) return firstPass;
  const after = /* @__PURE__ */ new Map();
  scope.entities.forEach((e, eid) => {
    const upd = merged.get(eid);
    after.set(eid, {
      id: eid,
      deadline: upd?.deadline ?? e.deadline,
      start_at: upd?.start_at ?? e.start_at
    });
  });
  const remaining = resolveAllViolations(deps, after);
  for (const eid of merged.keys()) {
    if (eid === id) remaining.delete(eid);
  }
  const secondPass = await applyUpdates(supabase, scope, remaining, opts);
  if ("error" in secondPass) return secondPass;
  const byId = /* @__PURE__ */ new Map();
  for (const s of [...firstPass.shifted, ...secondPass.shifted]) {
    if (s.id === id) continue;
    const prev = byId.get(s.id);
    byId.set(s.id, prev ? { ...s, from: prev.from } : s);
  }
  const shifted = [...byId.values()];
  const planning = await isPlanningPhase(supabase, scope.groupId.get(id));
  return {
    moved: {
      id,
      kind,
      name: scope.name.get(id),
      from: oldDeadline,
      to: newDeadline.toISOString(),
      shift_days: shiftDays
    },
    shifted,
    recorded_as_drift: kind === "task" && !planning
  };
}
async function entityKind(supabase, id) {
  const { data: task } = await supabase.from("tasks").select("id").eq("id", id).maybeSingle();
  if (task) return "task";
  const { data: ms } = await supabase.from("project_milestones").select("id").eq("id", id).maybeSingle();
  if (ms) return "milestone";
  return null;
}
function findCycle(edges) {
  const next = /* @__PURE__ */ new Map();
  for (const e of edges) {
    if (!next.has(e.from)) next.set(e.from, []);
    next.get(e.from).push(e.to);
  }
  const state = /* @__PURE__ */ new Map();
  const walk = (id, stack) => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    for (const to of next.get(id) ?? []) {
      const found = walk(to, [...stack, id]);
      if (found) return found;
    }
    state.set(id, "done");
    return null;
  };
  for (const id of next.keys()) {
    const found = walk(id, []);
    if (found) return found;
  }
  return null;
}

// src/lib/mcp/tools/link_tasks.ts
var DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"];
var link_tasks_default = defineTool12({
  name: "link_tasks",
  title: "\u0421\u0432\u044F\u0437\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438",
  description: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u0441\u0432\u044F\u0437\u044C \xAB\u043F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u2192 \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A\xBB \u043C\u0435\u0436\u0434\u0443 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0438/\u0438\u043B\u0438 \u0432\u0435\u0445\u0430\u043C\u0438. \u0422\u0438\u043F FS (\u0444\u0438\u043D\u0438\u0448\u2192\u0441\u0442\u0430\u0440\u0442) \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E, lag_days \u2014 \u0437\u0430\u0434\u0435\u0440\u0436\u043A\u0430 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445 (\u043C\u043E\u0436\u043D\u043E \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u0443\u044E: \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u0440\u0430\u043D\u044C\u0448\u0435 \u043A\u043E\u043D\u0446\u0430 \u043F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430). \u041F\u043E\u0441\u043B\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u0434\u0432\u0438\u0433\u0430\u044E\u0442\u0441\u044F \u0432\u043F\u0435\u0440\u0451\u0434, \u0435\u0441\u043B\u0438 \u043D\u0430\u0440\u0443\u0448\u0430\u043B\u0438 \u0441\u0432\u044F\u0437\u044C \u2014 \u043A\u0430\u043A \u0438 \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438; \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u0435 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442\u0441\u044F \u0441\u043F\u0438\u0441\u043A\u043E\u043C. \u0421\u0432\u044F\u0437\u044C, \u0441\u043E\u0437\u0434\u0430\u044E\u0449\u0430\u044F \u0446\u0438\u043A\u043B, \u043E\u0442\u043A\u043B\u043E\u043D\u044F\u0435\u0442\u0441\u044F. \u0418\u0434\u0435\u043D\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u043E\u0440\u044B \u0431\u0435\u0440\u0438\u0442\u0435 \u0438\u0437 get_project_schedule.",
  inputSchema: {
    predecessor_id: z12.string().uuid().describe("UUID \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0438\u0434\u0451\u0442 \u043F\u0435\u0440\u0432\u044B\u043C (\u0437\u0430\u0434\u0430\u0447\u0430 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430)."),
    successor_id: z12.string().uuid().describe("UUID \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u0438\u0434\u0451\u0442 \u0441\u043B\u0435\u0434\u043E\u043C (\u0437\u0430\u0434\u0430\u0447\u0430 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430)."),
    dependency_type: z12.enum(DEPENDENCY_TYPES).optional().describe("FS \u2014 \u0444\u0438\u043D\u0438\u0448\u2192\u0441\u0442\u0430\u0440\u0442 (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E), SS \u2014 \u0441\u0442\u0430\u0440\u0442\u2192\u0441\u0442\u0430\u0440\u0442, FF \u2014 \u0444\u0438\u043D\u0438\u0448\u2192\u0444\u0438\u043D\u0438\u0448, SF \u2014 \u0441\u0442\u0430\u0440\u0442\u2192\u0444\u0438\u043D\u0438\u0448."),
    lag_days: z12.number().int().min(-365).max(365).optional().describe("\u0417\u0430\u0434\u0435\u0440\u0436\u043A\u0430 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 0.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    if (input.predecessor_id === input.successor_id) return fail("\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u0432\u044F\u0437\u0430\u0442\u044C \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u0441\u0430\u043C \u0441 \u0441\u043E\u0431\u043E\u0439");
    const predKind = await entityKind(supabase, input.predecessor_id);
    if (!predKind) return fail("\u041F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const succKind = await entityKind(supabase, input.successor_id);
    if (!succKind) return fail("\u041F\u0440\u0435\u0435\u043C\u043D\u0438\u043A \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const deps = await fetchDependencies(supabase);
    if ("error" in deps) return fail(deps.error);
    if (deps.some((d) => d.predecessor_id === input.predecessor_id && d.successor_id === input.successor_id)) {
      return fail("\u0422\u0430\u043A\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u0443\u0436\u0435 \u0435\u0441\u0442\u044C");
    }
    if (wouldCreateCycle(input.predecessor_id, input.successor_id, deps)) {
      return fail("\u0422\u0430\u043A\u0430\u044F \u0441\u0432\u044F\u0437\u044C \u0437\u0430\u043C\u043A\u043D\u0451\u0442 \u0446\u0435\u043F\u043E\u0447\u043A\u0443 \u0432 \u043A\u043E\u043B\u044C\u0446\u043E \u2014 \u043E\u0442\u043A\u0430\u0437\u0430\u043D\u043E");
    }
    const row = {
      predecessor_id: input.predecessor_id,
      successor_id: input.successor_id,
      dependency_type: input.dependency_type ?? "FS",
      lag_days: input.lag_days ?? 0,
      predecessor_entity_type: predKind,
      successor_entity_type: succKind,
      created_by: uid
    };
    const { data: created, error } = await supabase.from("task_dependencies").insert(row).select("id,predecessor_id,successor_id,dependency_type,lag_days").single();
    if (error) return fail(error.message);
    const result = await cascade(
      supabase,
      [...deps, { ...row, id: created.id }],
      [input.predecessor_id, input.successor_id]
    );
    if ("error" in result) {
      return fail(`\u0421\u0432\u044F\u0437\u044C \u0441\u043E\u0437\u0434\u0430\u043D\u0430 (${created.id}), \u043D\u043E \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442 \u0441\u0440\u043E\u043A\u043E\u0432 \u043D\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D: ${result.error}`);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            created: true,
            dependency: { ...created, predecessor_kind: predKind, successor_kind: succKind },
            shifted: result.shifted,
            shifted_count: result.shifted.length
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/unlink_tasks.ts
import { defineTool as defineTool13 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z13 } from "npm:zod@^4.4.3";
var unlink_tasks_default = defineTool13({
  name: "unlink_tasks",
  title: "\u0421\u043D\u044F\u0442\u044C \u0441\u0432\u044F\u0437\u044C \u043C\u0435\u0436\u0434\u0443 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430\u043C\u0438",
  description: "\u0423\u0434\u0430\u043B\u044F\u0435\u0442 \u0441\u0432\u044F\u0437\u044C \xAB\u043F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A \u2192 \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A\xBB. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043B\u0438\u0431\u043E dependency_id, \u043B\u0438\u0431\u043E \u043F\u0430\u0440\u0443 predecessor_id/successor_id. \u0421\u0440\u043E\u043A\u0438, \u0440\u0430\u043D\u0435\u0435 \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u044B\u0435 \u044D\u0442\u043E\u0439 \u0441\u0432\u044F\u0437\u044C\u044E, \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u043A\u0430\u043A \u0435\u0441\u0442\u044C \u2014 \u0441\u043D\u044F\u0442\u0438\u0435 \u0441\u0432\u044F\u0437\u0438 \u0438\u0445 \u043D\u0435 \u043E\u0442\u043A\u0430\u0442\u044B\u0432\u0430\u0435\u0442.",
  inputSchema: {
    dependency_id: z13.string().uuid().optional().describe("UUID \u0441\u0432\u044F\u0437\u0438 (task_dependencies.id)."),
    predecessor_id: z13.string().uuid().optional().describe("UUID \u043F\u0440\u0435\u0434\u0448\u0435\u0441\u0442\u0432\u0435\u043D\u043D\u0438\u043A\u0430 \u2014 \u0432\u043C\u0435\u0441\u0442\u043E dependency_id."),
    successor_id: z13.string().uuid().optional().describe("UUID \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A\u0430 \u2014 \u0432\u043C\u0435\u0441\u0442\u043E dependency_id.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const byPair = !!(input.predecessor_id && input.successor_id);
    if (!input.dependency_id && !byPair) {
      return fail("\u041D\u0443\u0436\u0435\u043D \u043B\u0438\u0431\u043E dependency_id, \u043B\u0438\u0431\u043E \u043E\u0431\u0430: predecessor_id \u0438 successor_id");
    }
    let q = supabase.from("task_dependencies").select("id,predecessor_id,successor_id,dependency_type,lag_days");
    q = input.dependency_id ? q.eq("id", input.dependency_id) : q.eq("predecessor_id", input.predecessor_id).eq("successor_id", input.successor_id);
    const { data: found, error: rErr } = await q;
    if (rErr) return fail(rErr.message);
    if (!found || found.length === 0) return fail("\u0421\u0432\u044F\u0437\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u0430");
    if (found.length > 1) {
      return fail(
        `\u041F\u043E\u0434 \u0443\u0441\u043B\u043E\u0432\u0438\u0435 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 ${found.length} \u0441\u0432\u044F\u0437\u0435\u0439: ${found.map((d) => d.id).join(", ")}. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 dependency_id.`
      );
    }
    const dep = found[0];
    const { error } = await supabase.from("task_dependencies").delete().eq("id", dep.id);
    if (error) return fail(error.message);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ deleted: true, dependency: dep, note: "\u0421\u0440\u043E\u043A\u0438 \u043D\u0435 \u043E\u0442\u043A\u0430\u0442\u044B\u0432\u0430\u043B\u0438\u0441\u044C" })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/preview_shift.ts
import { defineTool as defineTool14 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z14 } from "npm:zod@^4.4.3";

// src/lib/mcp/tools/_dates.ts
async function parseTargetDate(supabase, input) {
  const hasDate = input.new_deadline !== void 0;
  const hasShift = input.shift_days !== void 0;
  if (hasDate === hasShift) {
    return { error: "\u041D\u0443\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u0440\u043E\u0432\u043D\u043E \u043E\u0434\u043D\u043E: new_deadline \u0438\u043B\u0438 shift_days" };
  }
  if (hasDate) {
    const d = new Date(input.new_deadline);
    if (Number.isNaN(d.getTime())) return { error: `\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${input.new_deadline}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.` };
    const y = d.getUTCFullYear();
    if (y < 2e3 || y > 2100) return { error: `\u0414\u0430\u0442\u0430 ${input.new_deadline} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).` };
    return { date: d };
  }
  if (input.shift_days === 0) return { error: "\u0421\u0434\u0432\u0438\u0433 \u043D\u0430 \u043D\u043E\u043B\u044C \u0434\u043D\u0435\u0439 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043C\u0435\u043D\u044F\u0435\u0442" };
  const kind = await entityKind(supabase, input.id);
  if (!kind) return { error: "\u0417\u0430\u0434\u0430\u0447\u0430 \u0438\u043B\u0438 \u0432\u0435\u0445\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430, \u043B\u0438\u0431\u043E \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430" };
  const table = kind === "task" ? "tasks" : "project_milestones";
  const column = kind === "task" ? "deadline" : "planned_date";
  const { data, error } = await supabase.from(table).select(column).eq("id", input.id).maybeSingle();
  if (error) return { error: error.message };
  const current = data?.[column] ?? null;
  if (!current) {
    return {
      error: kind === "task" ? "\u0423 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0435\u0442 \u0441\u0440\u043E\u043A\u0430, \u0441\u0434\u0432\u0438\u0433\u0430\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E. \u041F\u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0441\u0440\u043E\u043A \u0447\u0435\u0440\u0435\u0437 update_task \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 new_deadline." : "\u0423 \u0432\u0435\u0445\u0438 \u043D\u0435\u0442 \u043F\u043B\u0430\u043D\u043E\u0432\u043E\u0439 \u0434\u0430\u0442\u044B. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 new_deadline."
    };
  }
  return { date: new Date(new Date(current).getTime() + input.shift_days * 864e5) };
}

// src/lib/mcp/tools/preview_shift.ts
var preview_shift_default = defineTool14({
  name: "preview_shift",
  title: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u0441\u0442\u0432\u0438\u044F \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0430",
  description: "\u0421\u0447\u0438\u0442\u0430\u0435\u0442, \u0447\u0442\u043E \u043F\u0440\u043E\u0438\u0437\u043E\u0439\u0434\u0451\u0442 \u043F\u0440\u0438 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438: \u043D\u0430 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0434\u043D\u0435\u0439 \u0441\u0434\u0432\u0438\u043D\u0435\u0442\u0441\u044F \u043E\u043D\u0430 \u0441\u0430\u043C\u0430 \u0438 \u0447\u0442\u043E \u043F\u043E\u0442\u044F\u043D\u0435\u0442\u0441\u044F \u0437\u0430 \u043D\u0435\u0439 \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C. \u041D\u0418\u0427\u0415\u0413\u041E \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0434\u0430\u0442\u0443 (new_deadline) \u043B\u0438\u0431\u043E \u0441\u0434\u0432\u0438\u0433 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445 (shift_days, \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u2014 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u043D\u0430\u0437\u0430\u0434). \u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0439\u0442\u0435 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0434\u043E \u0437\u0430\u043F\u0438\u0441\u0438: \u0441\u0434\u0432\u0438\u0433 \u0437\u0430\u0434\u0435\u0432\u0430\u0435\u0442 \u0441\u0440\u043E\u043A\u0438, \u043E \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0443\u0436\u0435 \u043C\u043E\u0433\u043B\u0438 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u0442\u044C\u0441\u044F. \u041F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 move_task.",
  inputSchema: {
    id: z14.string().uuid().describe("UUID \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438."),
    new_deadline: z14.string().optional().describe("\u041D\u043E\u0432\u044B\u0439 \u0441\u0440\u043E\u043A, ISO datetime."),
    shift_days: z14.number().int().min(-3650).max(3650).optional().describe("\u0421\u0434\u0432\u0438\u0433 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445 \u0432\u043C\u0435\u0441\u0442\u043E \u043D\u043E\u0432\u043E\u0439 \u0434\u0430\u0442\u044B.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const target = await parseTargetDate(supabase, input);
    if ("error" in target) return fail(target.error);
    const result = await moveWithCascade(supabase, input.id, target.date, { dryRun: true });
    if ("error" in result) return fail(result.error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: false,
            move: result.moved,
            would_shift: result.shifted,
            would_shift_count: result.shifted.length,
            recorded_as_drift: result.recorded_as_drift,
            baseline_note: result.recorded_as_drift ? "\u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D: \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0437\u0430\u043F\u0438\u0448\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u044C. \u0421\u043A\u0430\u0436\u0438\u0442\u0435 \u043E\u0431 \u044D\u0442\u043E\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443." : "\u041F\u0440\u043E\u0435\u043A\u0442 \u0435\u0449\u0451 \u043D\u0430 \u044D\u0442\u0430\u043F\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F: \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0441\u0434\u0432\u0438\u0433\u043E\u043C \u043D\u0435 \u0437\u0430\u043F\u0438\u0448\u0435\u0442\u0441\u044F.",
            apply_with: "move_task"
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/move_task.ts
import { defineTool as defineTool15 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z15 } from "npm:zod@^4.4.3";
var move_task_default = defineTool15({
  name: "move_task",
  title: "\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u0441 \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442\u043E\u043C \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445",
  description: "\u041F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0437\u0430\u0434\u0430\u0447\u0443 \u0438\u043B\u0438 \u0432\u0435\u0445\u0443 \u0438 \u0441\u0434\u0432\u0438\u0433\u0430\u0435\u0442 \u0432\u0441\u0451, \u0447\u0442\u043E \u0441\u0442\u043E\u0438\u0442 \u0437\u0430 \u043D\u0435\u0439 \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C \u2014 \u043A\u0430\u043A \u043F\u0435\u0440\u0435\u0442\u0430\u0441\u043A\u0438\u0432\u0430\u043D\u0438\u0435 \u0432 \u0413\u0430\u043D\u0442\u0435. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0434\u0430\u0442\u0443 (new_deadline) \u043B\u0438\u0431\u043E \u0441\u0434\u0432\u0438\u0433 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445 (shift_days, \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u2014 \u043D\u0430\u0437\u0430\u0434). \u0423 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0430\u0447\u0430\u043B\u043E \u0435\u0434\u0435\u0442 \u0432\u043C\u0435\u0441\u0442\u0435 \u0441\u043E \u0441\u0440\u043E\u043A\u043E\u043C, \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F. \u0417\u0430\u0442\u0440\u0430\u0433\u0438\u0432\u0430\u0435\u0442 \u0447\u0443\u0436\u0438\u0435 \u0441\u0440\u043E\u043A\u0438, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043A\u0430\u0436\u0438\u0442\u0435 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 preview_shift, \u0430 move_task \u0432\u044B\u0437\u044B\u0432\u0430\u0439\u0442\u0435 \u043F\u043E\u0441\u043B\u0435 \u0435\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F. \u0415\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0441\u0440\u043E\u043A \u041E\u0414\u041D\u041E\u0419 \u0437\u0430\u0434\u0430\u0447\u0438, \u043D\u0438\u0447\u0435\u0433\u043E \u0437\u0430 \u043D\u0435\u0439 \u043D\u0435 \u0434\u0432\u0438\u0433\u0430\u044F, \u2014 \u044D\u0442\u043E update_task.",
  inputSchema: {
    id: z15.string().uuid().describe("UUID \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438."),
    new_deadline: z15.string().optional().describe("\u041D\u043E\u0432\u044B\u0439 \u0441\u0440\u043E\u043A, ISO datetime."),
    shift_days: z15.number().int().min(-3650).max(3650).optional().describe("\u0421\u0434\u0432\u0438\u0433 \u0432 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0445 \u0434\u043D\u044F\u0445 \u0432\u043C\u0435\u0441\u0442\u043E \u043D\u043E\u0432\u043E\u0439 \u0434\u0430\u0442\u044B.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const target = await parseTargetDate(supabase, input);
    if ("error" in target) return fail(target.error);
    const result = await moveWithCascade(supabase, input.id, target.date);
    if ("error" in result) return fail(result.error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: true,
            move: result.moved,
            shifted: result.shifted,
            shifted_count: result.shifted.length,
            recorded_as_drift: result.recorded_as_drift,
            baseline_note: result.recorded_as_drift ? "\u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D \u2014 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0437\u0430\u043F\u0438\u0441\u0430\u043D \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u043E\u0442 \u043F\u043B\u0430\u043D\u0430." : "\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0430 \u044D\u0442\u0430\u043F\u0435 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u2014 \u0441\u0434\u0432\u0438\u0433 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D.",
            note: result.shifted.length > 0 ? "\u0421\u0434\u0432\u0438\u043D\u0443\u043B\u0438\u0441\u044C \u0447\u0443\u0436\u0438\u0435 \u0441\u0440\u043E\u043A\u0438 \u2014 \u043E \u043D\u0438\u0445 \u0441\u0442\u043E\u0438\u0442 \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u043B\u044E\u0434\u044F\u043C." : "\u0421\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 \u0441\u0434\u0432\u0438\u0433\u043E\u0432 \u043D\u0435 \u043F\u043E\u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043B\u043E\u0441\u044C."
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/upsert_plan.ts
import { defineTool as defineTool16 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z16 } from "npm:zod@^4.4.3";
var MAX_ITEMS = 60;
var parseDate = (raw, what) => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { error: `${what}: \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${raw}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.` };
  const y = d.getUTCFullYear();
  if (y < 2e3 || y > 2100) return { error: `${what}: \u0434\u0430\u0442\u0430 ${raw} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).` };
  return { date: d.toISOString() };
};
var upsert_plan_default = defineTool16({
  name: "upsert_plan",
  title: "\u0420\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u0421\u043E\u0431\u0438\u0440\u0430\u0435\u0442 \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0440\u0430\u0437\u043B\u0430\u0433\u0430\u0435\u0442 \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043E\u0434\u043D\u0438\u043C \u0432\u044B\u0437\u043E\u0432\u043E\u043C: \u0437\u0430\u0434\u0430\u0447\u0438, \u0432\u0435\u0445\u0438 \u0438 \u0441\u0432\u044F\u0437\u0438 \u043C\u0435\u0436\u0434\u0443 \u043D\u0438\u043C\u0438. \u041F\u041E \u0423\u041C\u041E\u041B\u0427\u0410\u041D\u0418\u042E \u041D\u0418\u0427\u0415\u0413\u041E \u041D\u0415 \u0417\u0410\u041F\u0418\u0421\u042B\u0412\u0410\u0415\u0422 \u2014 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0440\u0430\u0437\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u043D\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443; \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 apply=true, \u043F\u043E\u0441\u043B\u0435 \u0442\u043E\u0433\u043E \u043A\u0430\u043A \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043B. \u0423 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432 \u0435\u0441\u0442\u044C key \u2014 \u043A\u043E\u0440\u043E\u0442\u043A\u043E\u0435 \u0438\u043C\u044F \u0432\u043D\u0443\u0442\u0440\u0438 \u044D\u0442\u043E\u0433\u043E \u0432\u044B\u0437\u043E\u0432\u0430, \u043D\u0430 \u043D\u0435\u0433\u043E \u0441\u0441\u044B\u043B\u0430\u044E\u0442\u0441\u044F \u0441\u0432\u044F\u0437\u0438 (links: from/to \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u044E\u0442 key \u0438\u043B\u0438 UUID \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430). \u042D\u043B\u0435\u043C\u0435\u043D\u0442 \u0441 id \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F, \u0431\u0435\u0437 id \u2014 \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F. kind: task \u0438\u043B\u0438 milestone; \u0443 \u0432\u0435\u0445\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430 deadline (\u044D\u0442\u043E \u0435\u0451 \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430). \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0432\u0441\u0451 \u0434\u043E \u0437\u0430\u043F\u0438\u0441\u0438: \u0434\u0430\u0442\u044B, \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438, \u0441\u0441\u044B\u043B\u043A\u0438, \u043A\u043E\u043B\u044C\u0446\u0430 \u0432 \u0441\u0432\u044F\u0437\u044F\u0445. \u041B\u0438\u0431\u043E \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E \u0432\u0441\u0451, \u043B\u0438\u0431\u043E \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043E \u043D\u0438\u0447\u0435\u0433\u043E.",
  inputSchema: {
    project_id: z16.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id)."),
    apply: z16.boolean().optional().describe("true \u2014 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E false: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C."),
    items: z16.array(
      z16.object({
        key: z16.string().min(1).max(40).optional().describe("\u0418\u043C\u044F \u0432\u043D\u0443\u0442\u0440\u0438 \u0432\u044B\u0437\u043E\u0432\u0430, \u0434\u043B\u044F \u0441\u0441\u044B\u043B\u043E\u043A \u0438\u0437 links."),
        id: z16.string().uuid().optional().describe("UUID \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430 \u2014 \u0442\u043E\u0433\u0434\u0430 \u043E\u043D \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F."),
        kind: z16.enum(["task", "milestone"]),
        title: z16.string().min(1).max(500),
        start_at: z16.string().optional().describe("\u041D\u0430\u0447\u0430\u043B\u043E, ISO datetime. \u0423 \u0432\u0435\u0445\u0438 \u043D\u0435 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442\u0441\u044F."),
        deadline: z16.string().optional().describe("\u0421\u0440\u043E\u043A; \u0443 \u0432\u0435\u0445\u0438 \u2014 \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430 (\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438)."),
        description: z16.string().max(2e3).optional(),
        assignee: z16.string().optional().describe("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0437\u0430\u0434\u0430\u0447\u0438: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F."),
        status: z16.enum(MILESTONE_STATUSES).optional().describe("\u0422\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u0435\u0445\u0438.")
      })
    ).min(1).max(MAX_ITEMS),
    links: z16.array(
      z16.object({
        from: z16.string().describe("key \u0438\u0437 items \u0438\u043B\u0438 UUID \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430."),
        to: z16.string().describe("key \u0438\u0437 items \u0438\u043B\u0438 UUID \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430."),
        type: z16.enum(DEPENDENCY_TYPES).optional().describe("\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E FS."),
        lag_days: z16.number().int().min(-365).max(365).optional()
      })
    ).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const { data: project, error: pErr } = await supabase.from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
    if (pErr) return fail(pErr.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const problems = [];
    const byKey = /* @__PURE__ */ new Map();
    for (const [i, it] of input.items.entries()) {
      const where = it.key ? `\xAB${it.key}\xBB` : `\u044D\u043B\u0435\u043C\u0435\u043D\u0442 ${i + 1} (\xAB${it.title}\xBB)`;
      if (it.key) {
        if (byKey.has(it.key)) problems.push(`${where}: key \u043F\u043E\u0432\u0442\u043E\u0440\u044F\u0435\u0442\u0441\u044F \u2014 \u0441\u0441\u044B\u043B\u043A\u0438 \u0441\u0442\u0430\u043B\u0438 \u0431\u044B \u0434\u0432\u0443\u0441\u043C\u044B\u0441\u043B\u0435\u043D\u043D\u044B\u043C\u0438`);
        byKey.set(it.key, it);
      }
      if (it.kind === "milestone" && !it.id && !it.deadline) {
        problems.push(`${where}: \u0443 \u0432\u0435\u0445\u0438 \u043D\u0443\u0436\u043D\u0430 deadline \u2014 \u044D\u0442\u043E \u0435\u0451 \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430`);
      }
      if (it.kind === "milestone" && it.assignee) problems.push(`${where}: \u0443 \u0432\u0435\u0445\u0438 \u043D\u0435\u0442 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F`);
      if (it.kind === "task" && it.status) problems.push(`${where}: status \u0437\u0434\u0435\u0441\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u0432\u0435\u0445\u0438`);
      const dates = {};
      for (const field of ["start_at", "deadline"]) {
        const raw = it[field];
        if (raw === void 0) continue;
        const parsed2 = parseDate(raw, `${where}, ${field}`);
        if ("error" in parsed2) {
          problems.push(parsed2.error);
          continue;
        }
        dates[field] = parsed2.date;
      }
      if (dates.start_at && dates.deadline && new Date(dates.start_at) > new Date(dates.deadline)) {
        problems.push(`${where}: \u043D\u0430\u0447\u0430\u043B\u043E \u043F\u043E\u0437\u0436\u0435 \u0441\u0440\u043E\u043A\u0430 \u2014 \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0430\u0441\u044C \u0431\u044B \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0434\u043B\u0438\u043D\u044B`);
      }
      it.start_at = dates.start_at ?? it.start_at;
      it.deadline = dates.deadline ?? it.deadline;
    }
    const assignees = /* @__PURE__ */ new Map();
    for (const it of input.items) {
      if (!it.assignee || assignees.has(it.assignee)) continue;
      const r = await resolveUser(supabase, it.assignee);
      if ("error" in r) {
        problems.push(`\xAB${it.title}\xBB: ${r.error}`);
        continue;
      }
      assignees.set(it.assignee, r);
    }
    const existingKind = /* @__PURE__ */ new Map();
    for (const it of input.items) {
      if (!it.id) continue;
      const kind = await entityKind(supabase, it.id);
      if (!kind) {
        problems.push(`\xAB${it.title}\xBB (${it.id}): \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430`);
        continue;
      }
      if (kind !== it.kind) problems.push(`\xAB${it.title}\xBB (${it.id}): \u0432 \u0431\u0430\u0437\u0435 \u044D\u0442\u043E ${kind}, \u0430 \u0432 \u043F\u043B\u0430\u043D\u0435 ${it.kind}`);
      existingKind.set(it.id, kind);
    }
    const links = input.links ?? [];
    const endpoint = async (ref, side, n) => {
      if (byKey.has(ref)) return ref;
      const item = input.items.find((i) => i.id === ref);
      if (item) return ref;
      const kind = await entityKind(supabase, ref);
      if (kind) return ref;
      problems.push(`\u0441\u0432\u044F\u0437\u044C ${n + 1}, ${side}: \xAB${ref}\xBB \u2014 \u043D\u0438 key \u0438\u0437 \u044D\u0442\u043E\u0433\u043E \u0432\u044B\u0437\u043E\u0432\u0430, \u043D\u0438 \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0439 UUID`);
      return null;
    };
    for (const [n, l] of links.entries()) {
      const from = await endpoint(l.from, "from", n);
      const to = await endpoint(l.to, "to", n);
      if (from && to && from === to) problems.push(`\u0441\u0432\u044F\u0437\u044C ${n + 1}: \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u0441\u0432\u044F\u0437\u0430\u043D \u0441\u0430\u043C \u0441 \u0441\u043E\u0431\u043E\u0439`);
    }
    const deps = await fetchDependencies(supabase);
    if ("error" in deps) return fail(deps.error);
    const cycle = findCycle([
      ...deps.map((d) => ({ from: d.predecessor_id, to: d.successor_id })),
      ...links.map((l) => ({ from: l.from, to: l.to }))
    ]);
    if (cycle) problems.push(`\u0441\u0432\u044F\u0437\u0438 \u0437\u0430\u043C\u044B\u043A\u0430\u044E\u0442\u0441\u044F \u0432 \u043A\u043E\u043B\u044C\u0446\u043E: ${cycle.join(" \u2192 ")}`);
    if (problems.length) {
      return fail(
        `\u041F\u043B\u0430\u043D \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D, ${problems.length === 1 ? "\u043C\u0435\u0448\u0430\u0435\u0442" : "\u043C\u0435\u0448\u0430\u044E\u0442"}:
\u2014 ${problems.join("\n\u2014 ")}`
      );
    }
    const plan = {
      project: { id: project.id, name: project.name },
      create: input.items.filter((i) => !i.id).map((i) => ({
        key: i.key ?? null,
        kind: i.kind,
        title: i.title,
        start_at: i.start_at ?? null,
        deadline: i.deadline ?? null,
        assignee: i.assignee ? assignees.get(i.assignee).name : null
      })),
      update: input.items.filter((i) => i.id).map((i) => ({
        id: i.id,
        kind: i.kind,
        title: i.title,
        start_at: i.start_at ?? null,
        deadline: i.deadline ?? null,
        assignee: i.assignee ? assignees.get(i.assignee).name : null
      })),
      links: links.map((l) => ({ from: l.from, to: l.to, type: l.type ?? "FS", lag_days: l.lag_days ?? 0 }))
    };
    if (!input.apply) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              written: false,
              checked: true,
              plan,
              counts: { create: plan.create.length, update: plan.update.length, links: plan.links.length },
              apply_with: "\u0442\u043E\u0442 \u0436\u0435 \u0432\u044B\u0437\u043E\u0432 \u0441 apply=true, \u043F\u043E\u0441\u043B\u0435 \u0442\u043E\u0433\u043E \u043A\u0430\u043A \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043B \u043F\u043B\u0430\u043D"
            })
          }
        ]
      };
    }
    const planningCache = /* @__PURE__ */ new Map();
    const resolved = /* @__PURE__ */ new Map();
    const done = [];
    const warnings = [];
    const stop = (msg) => fail(
      `\u0417\u0430\u043F\u0438\u0441\u044C \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430: ${msg}
\u0423\u0441\u043F\u0435\u043B\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F: ${done.length ? done.join("; ") : "\u043D\u0438\u0447\u0435\u0433\u043E"}.
\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0432\u044B\u0437\u043E\u0432 \u0441\u043E\u0437\u0434\u0430\u0441\u0442 \u043D\u043E\u0432\u044B\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B \u0437\u0430\u043D\u043E\u0432\u043E \u2014 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.`
    );
    for (const it of input.items) {
      if (it.id) {
        const table = it.kind === "task" ? "tasks" : "project_milestones";
        const patch = { title: it.title };
        if (it.kind === "task") {
          if (it.start_at) patch.start_at = it.start_at;
          if (it.deadline) patch.deadline = it.deadline;
          if (it.deadline && await isPlanningPhase(supabase, input.project_id, planningCache)) {
            patch.original_deadline = it.deadline;
          }
          if (it.description !== void 0) patch.description = it.description;
          if (it.assignee) patch.assigned_to = assignees.get(it.assignee).id;
        } else {
          patch.name = it.title;
          delete patch.title;
          if (it.deadline) patch.planned_date = it.deadline;
          if (it.description !== void 0) patch.description = it.description;
          if (it.status) patch.status = it.status;
          patch.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        }
        const { data: upd, error } = await supabase.from(table).update(patch).eq("id", it.id).select("id");
        if (error) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \xAB${it.title}\xBB: ${error.message}`);
        if (!upd?.length) return stop(`\u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \xAB${it.title}\xBB`);
        resolved.set(it.id, it.id);
        if (it.key) resolved.set(it.key, it.id);
        done.push(`\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E \xAB${it.title}\xBB`);
        continue;
      }
      if (it.kind === "task") {
        const created = await insertTask(supabase, uid, {
          title: it.title,
          description: it.description ?? null,
          deadline: it.deadline ?? null,
          start_at: it.start_at ?? null,
          group_id: input.project_id,
          assigned_to: it.assignee ? assignees.get(it.assignee).id : uid,
          status_meta: { created_by: "claude", created_via: "mcp", source: { kind: "plan" } }
        });
        if ("error" in created) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443 \xAB${it.title}\xBB: ${created.error}`);
        warnings.push(...created.warnings);
        resolved.set(it.key ?? created.task.id, created.task.id);
        done.push(`\u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0430 \xAB${it.title}\xBB`);
      } else {
        const { data: last } = await supabase.from("project_milestones").select("position").eq("group_id", input.project_id).order("position", { ascending: false }).limit(1).maybeSingle();
        const { data: ms, error } = await supabase.from("project_milestones").insert({
          group_id: input.project_id,
          name: it.title,
          planned_date: it.deadline,
          description: it.description ?? null,
          status: it.status ?? "pending",
          color: "#3b82f6",
          created_by: uid,
          position: (last?.position ?? 0) + 1
        }).select("id").single();
        if (error) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0432\u0435\u0445\u0443 \xAB${it.title}\xBB: ${error.message}`);
        resolved.set(it.key ?? ms.id, ms.id);
        done.push(`\u0441\u043E\u0437\u0434\u0430\u043D\u0430 \u0432\u0435\u0445\u0430 \xAB${it.title}\xBB`);
      }
    }
    const knownKinds = /* @__PURE__ */ new Map();
    for (const it of input.items) {
      const id = resolved.get(it.key ?? it.id ?? "");
      if (id) knownKinds.set(id, it.kind);
    }
    const linkedIds = [];
    for (const l of links) {
      const from = resolved.get(l.from) ?? l.from;
      const to = resolved.get(l.to) ?? l.to;
      if (deps.some((d) => d.predecessor_id === from && d.successor_id === to)) {
        warnings.push(`\u0441\u0432\u044F\u0437\u044C ${l.from} \u2192 ${l.to} \u0443\u0436\u0435 \u0431\u044B\u043B\u0430, \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u0430`);
        continue;
      }
      const fromKind = knownKinds.get(from) ?? await entityKind(supabase, from);
      const toKind = knownKinds.get(to) ?? await entityKind(supabase, to);
      if (!fromKind || !toKind) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u0432\u0438\u0434 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432 \u0441\u0432\u044F\u0437\u0438 ${l.from} \u2192 ${l.to}`);
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: from,
        successor_id: to,
        dependency_type: l.type ?? "FS",
        lag_days: l.lag_days ?? 0,
        predecessor_entity_type: fromKind,
        successor_entity_type: toKind,
        created_by: uid
      });
      if (error) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0432\u044F\u0437\u044C ${l.from} \u2192 ${l.to}: ${error.message}`);
      linkedIds.push(from, to);
      done.push(`\u0441\u0432\u044F\u0437\u044C ${l.from} \u2192 ${l.to}`);
    }
    let shifted = null;
    if (linkedIds.length) {
      const fresh = await fetchDependencies(supabase);
      if ("error" in fresh) {
        warnings.push(`\u0441\u0440\u043E\u043A\u0438 \u043D\u0435 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D\u044B: ${fresh.error}`);
      } else {
        const r = await cascade(supabase, fresh, [...new Set(linkedIds)]);
        if ("error" in r) warnings.push(`\u0441\u0440\u043E\u043A\u0438 \u043F\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043D\u044B \u043D\u0435 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E: ${r.error}`);
        else shifted = r;
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: true,
            project: plan.project,
            created: plan.create.length,
            updated: plan.update.length,
            links: linkedIds.length ? plan.links.length : 0,
            ids: Object.fromEntries(resolved),
            shifted: shifted && "shifted" in shifted ? shifted.shifted : [],
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/create_project.ts
import { defineTool as defineTool17 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z17 } from "npm:zod@^4.4.3";
var create_project_default = defineTool17({
  name: "create_project",
  title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442",
  description: "\u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u043F\u0440\u043E\u0435\u043A\u0442 (task_groups) \u0441 \u0442\u0435\u0433\u043E\u043C-\u0437\u043E\u043D\u0442\u0438\u043A\u043E\u043C, \u043A\u0430\u043A \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438. parent_id \u2014 \u0441\u0434\u0435\u043B\u0430\u0442\u044C \u043F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0435\u0433\u043E: \u043C\u0435\u0442\u043A\u0438 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430 \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u043D\u0430\u0441\u043B\u0435\u0434\u0443\u044E\u0442\u0441\u044F. \u041F\u0440\u043E\u0435\u043A\u0442 \u0441 \u0442\u0430\u043A\u0438\u043C \u0436\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C \u043E\u0442\u043A\u043B\u043E\u043D\u044F\u0435\u0442\u0441\u044F. \u0414\u0430\u043B\u044C\u0448\u0435 \u0432 \u043F\u0440\u043E\u0435\u043A\u0442 \u043C\u043E\u0436\u043D\u043E \u0440\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043B\u0430\u043D \u0447\u0435\u0440\u0435\u0437 upsert_plan \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0443 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0447\u0435\u0440\u0435\u0437 apply_plan_template.",
  inputSchema: {
    name: z17.string().min(1).max(200).describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430."),
    parent_id: z17.string().uuid().optional().describe("UUID \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0435\u0441\u043B\u0438 \u044D\u0442\u043E \u043F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442."),
    description: z17.string().max(2e3).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const name = input.name.trim();
    const normalized = name.toLowerCase();
    const { data: groups, error: gErr } = await supabase.from("task_groups").select("id,name,linked_tag_id");
    if (gErr) return fail(gErr.message);
    const dup = (groups ?? []).find((g) => g.name.trim().toLowerCase() === normalized);
    if (dup) return fail(`\u041F\u0440\u043E\u0435\u043A\u0442 \xAB${dup.name}\xBB \u0443\u0436\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442 (${dup.id})`);
    if (input.parent_id && !(groups ?? []).some((g) => g.id === input.parent_id)) {
      return fail("\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    }
    const { data: tags } = await supabase.from("tags").select("id,name,user_id").eq("user_id", uid);
    const linkedTagIds = new Set((groups ?? []).map((g) => g.linked_tag_id).filter(Boolean));
    const reusable = (tags ?? []).find(
      (t) => t.name?.trim().toLowerCase() === normalized && !linkedTagIds.has(t.id)
    );
    let tagId = reusable?.id;
    if (!tagId) {
      const { data: tag, error: tErr } = await supabase.from("tags").insert({ name, user_id: uid, color: "#3b82f6" }).select("id").single();
      if (tErr) return fail(`\u0422\u0435\u0433 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D: ${tErr.message}`);
      tagId = tag.id;
    }
    const { data: group, error } = await supabase.from("task_groups").insert({
      name,
      user_id: uid,
      linked_tag_id: tagId,
      parent_id: input.parent_id ?? null,
      ...input.description ? { description: input.description } : {}
    }).select("id,name,parent_id").single();
    if (error) return fail(error.message);
    const warnings = [];
    const { error: mErr } = await supabase.from("group_members").insert({ group_id: group.id, user_id: uid, invited_by: uid, role: "owner" });
    if (mErr) warnings.push(`\u0441\u043E\u0437\u0434\u0430\u0442\u0435\u043B\u044C \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438: ${mErr.message}`);
    if (input.parent_id) {
      const { data: parentTags } = await supabase.from("group_tags").select("tag_id").eq("group_id", input.parent_id);
      const inherit = (parentTags ?? []).map((r) => r.tag_id).filter((id) => id && id !== tagId);
      if (inherit.length) {
        const { error: gtErr } = await supabase.from("group_tags").insert(inherit.map((tag_id) => ({ group_id: group.id, tag_id })));
        if (gtErr) warnings.push(`\u043C\u0435\u0442\u043A\u0438 \u0440\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u043D\u0435 \u0443\u043D\u0430\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u044B: ${gtErr.message}`);
      }
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            created: true,
            project: group,
            tag_reused: !!reusable,
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/apply_plan_template.ts
import { defineTool as defineTool18 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z18 } from "npm:zod@^4.4.3";

// src/lib/planTemplate.ts
import { addDays as addDays3, differenceInCalendarDays as differenceInCalendarDays4, parseISO as parseISO4 } from "npm:date-fns@^3.6.0";
var DAY2 = 864e5;
var norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
function layoutPlan(args) {
  const problems = [];
  const skipped = [];
  const scale = args.scale ?? 1;
  if (!(scale > 0) || scale > 10) problems.push(`\u041C\u0430\u0441\u0448\u0442\u0430\u0431 ${scale} \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u043C\u0438 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E (0 < scale \u2264 10)`);
  const start = parseISO4(args.startDate);
  if (Number.isNaN(start.getTime())) {
    return { template_anchor: null, items: [], links: [], skipped, problems: [`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \u043D\u0430\u0447\u0430\u043B\u0430 \xAB${args.startDate}\xBB`] };
  }
  const dated = args.items.filter((i) => {
    if (i.end) return true;
    skipped.push({ title: i.title, reason: "\u0432 \u043E\u0431\u0440\u0430\u0437\u0446\u0435 \u043D\u0435\u0442 \u0441\u0440\u043E\u043A\u0430 \u2014 \u0432 \u043F\u043B\u0430\u043D \u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u0441\u044F" });
    return false;
  });
  if (dated.length === 0) {
    return { template_anchor: null, items: [], links: [], skipped, problems: ["\u0412 \u043E\u0431\u0440\u0430\u0437\u0446\u0435 \u043D\u0435\u0442 \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430 \u0441\u043E \u0441\u0440\u043E\u043A\u043E\u043C"] };
  }
  const times = dated.flatMap((i) => [i.start, i.end].filter(Boolean).map((d) => parseISO4(d).getTime()));
  const anchor = Math.min(...times);
  const overrides = args.overrides ?? [];
  const matched = /* @__PURE__ */ new Map();
  for (const o of overrides) {
    const hits = dated.filter((i) => norm(i.title) === norm(o.match));
    const loose = hits.length ? hits : dated.filter((i) => norm(i.title).includes(norm(o.match)));
    if (loose.length === 0) {
      problems.push(`\u041F\u0440\u0430\u0432\u043A\u0430 \xAB${o.match}\xBB: \u0432 \u043E\u0431\u0440\u0430\u0437\u0446\u0435 \u043D\u0435\u0442 \u0442\u0430\u043A\u043E\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430`);
      continue;
    }
    if (loose.length > 1) {
      problems.push(`\u041F\u0440\u0430\u0432\u043A\u0430 \xAB${o.match}\xBB \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442 \u043A ${loose.length}: ${loose.map((i) => `\xAB${i.title}\xBB`).join(", ")}. \u0423\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435.`);
      continue;
    }
    const target = loose[0];
    if (matched.has(target.id)) {
      problems.push(`\u041D\u0430 \xAB${target.title}\xBB \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u0441\u044F \u0431\u043E\u043B\u044C\u0448\u0435 \u043E\u0434\u043D\u043E\u0439 \u043F\u0440\u0430\u0432\u043A\u0438`);
      continue;
    }
    if (o.new_date !== void 0 && o.shift_days !== void 0) {
      problems.push(`\u041F\u0440\u0430\u0432\u043A\u0430 \xAB${o.match}\xBB: \u043D\u0443\u0436\u043D\u043E \u043E\u0434\u043D\u043E \u0438\u0437 \u0434\u0432\u0443\u0445 \u2014 new_date \u0438\u043B\u0438 shift_days`);
      continue;
    }
    if (o.new_date !== void 0) {
      const d = parseISO4(o.new_date);
      if (Number.isNaN(d.getTime())) {
        problems.push(`\u041F\u0440\u0430\u0432\u043A\u0430 \xAB${o.match}\xBB: \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${o.new_date}\xBB`);
        continue;
      }
      const y = d.getUTCFullYear();
      if (y < 2e3 || y > 2100) {
        problems.push(`\u041F\u0440\u0430\u0432\u043A\u0430 \xAB${o.match}\xBB: \u0434\u0430\u0442\u0430 ${o.new_date} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100)`);
        continue;
      }
    }
    matched.set(target.id, o);
  }
  const laid = /* @__PURE__ */ new Map();
  for (const it of dated) {
    const o = matched.get(it.id);
    if (o?.skip) {
      skipped.push({ title: it.title, reason: "\u0438\u0441\u043A\u043B\u044E\u0447\u0451\u043D \u043F\u0440\u0430\u0432\u043A\u043E\u0439 \u0438\u0437 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F" });
      continue;
    }
    const endOffset = Math.round((parseISO4(it.end).getTime() - anchor) / DAY2 * scale);
    const startOffset = it.start ? Math.round((parseISO4(it.start).getTime() - anchor) / DAY2 * scale) : null;
    let end = addDays3(start, endOffset);
    let overridden = false;
    if (o?.new_date !== void 0) {
      end = parseISO4(o.new_date);
      overridden = true;
    } else if (o?.shift_days !== void 0) {
      end = addDays3(end, o.shift_days);
      overridden = true;
    }
    const duration = startOffset === null ? null : endOffset - startOffset;
    const startDate = duration === null ? null : addDays3(end, -duration);
    laid.set(it.id, {
      source_id: it.id,
      kind: it.kind,
      title: o?.title ?? it.title,
      start: startDate ? startDate.toISOString() : null,
      end: end.toISOString(),
      offset_start_days: startOffset,
      offset_end_days: endOffset,
      overridden,
      moved_by_links: false
    });
  }
  const links = args.links.filter((l) => laid.has(l.from) && laid.has(l.to));
  const droppedLinks = args.links.length - links.length;
  if (droppedLinks > 0) {
    skipped.push({ title: `\u0441\u0432\u044F\u0437\u0435\u0439: ${droppedLinks}`, reason: "\u043E\u0434\u0438\u043D \u0438\u0437 \u043A\u043E\u043D\u0446\u043E\u0432 \u043D\u0435 \u043F\u043E\u043F\u0430\u043B \u0432 \u043F\u043B\u0430\u043D" });
  }
  const entities = /* @__PURE__ */ new Map();
  laid.forEach((i, id) => entities.set(id, { id, start_at: i.start, deadline: i.end }));
  const fixes = resolveAllViolations(
    links.map((l, n) => ({
      id: String(n),
      predecessor_id: l.from,
      successor_id: l.to,
      dependency_type: l.type,
      lag_days: l.lag_days,
      created_by: "",
      created_at: "",
      predecessor_entity_type: "task",
      successor_entity_type: "task"
    })),
    entities
  );
  for (const [id, fix] of fixes) {
    const item = laid.get(id);
    if (!item) continue;
    if (fix.deadline) item.end = fix.deadline;
    if (fix.start_at && item.kind === "task") item.start = fix.start_at;
    item.moved_by_links = true;
  }
  const items = [...laid.values()].sort((a, b) => a.end.localeCompare(b.end));
  for (const i of items) {
    const y = new Date(i.end).getUTCFullYear();
    if (y < 2e3 || y > 2100) problems.push(`\xAB${i.title}\xBB: \u0440\u0430\u0441\u0447\u0451\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430 ${i.end} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430`);
    if (i.start && new Date(i.start) > new Date(i.end)) {
      problems.push(`\xAB${i.title}\xBB: \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u0430\u0432\u043E\u043A \u043D\u0430\u0447\u0430\u043B\u043E \u043E\u043A\u0430\u0437\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0437\u0436\u0435 \u0441\u0440\u043E\u043A\u0430`);
    }
  }
  return {
    template_anchor: new Date(anchor).toISOString(),
    items,
    links,
    skipped,
    problems
  };
}
function planSpanDays(items) {
  if (items.length === 0) return 0;
  const times = items.flatMap((i) => [i.start, i.end].filter(Boolean).map((d) => parseISO4(d).getTime()));
  return differenceInCalendarDays4(new Date(Math.max(...times)), new Date(Math.min(...times)));
}

// src/lib/mcp/tools/apply_plan_template.ts
var MAX_ITEMS2 = 200;
var apply_plan_template_default = defineTool18({
  name: "apply_plan_template",
  title: "\u041F\u043B\u0430\u043D \u043F\u043E \u043E\u0431\u0440\u0430\u0437\u0446\u0443 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u041F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442 \u0444\u043E\u0440\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430-\u043E\u0431\u0440\u0430\u0437\u0446\u0430 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u043F\u0440\u043E\u0435\u043A\u0442: \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0432\u0435\u0445\u0438 \u0441 \u0442\u0435\u043C\u0438 \u0436\u0435 \u043F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043A\u0430\u043C\u0438 \u043C\u0435\u0436\u0434\u0443 \u043D\u0438\u043C\u0438 \u0438 \u0442\u0435 \u0436\u0435 \u0441\u0432\u044F\u0437\u0438, \u043D\u043E \u043E\u0442 \u043D\u043E\u0432\u043E\u0439 \u0434\u0430\u0442\u044B. \u041E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u043D\u0430 \xAB\u0441\u0434\u0435\u043B\u0430\u0439 \u043F\u043B\u0430\u043D \u043F\u043E \u043F\u0440\u0438\u043C\u0435\u0440\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0442\u0430\u043A\u043E\u0433\u043E-\u0442\u043E\xBB. start_date \u2014 \u0441 \u043A\u0430\u043A\u043E\u0439 \u0434\u0430\u0442\u044B \u043D\u0430\u0447\u0438\u043D\u0430\u0435\u0442\u0441\u044F \u043D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D. scale \u0441\u0436\u0438\u043C\u0430\u0435\u0442 \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u044F\u0433\u0438\u0432\u0430\u0435\u0442 \u0432\u0435\u0441\u044C \u043F\u043B\u0430\u043D (0.5 \u2014 \u0432\u0434\u0432\u043E\u0435 \u0431\u044B\u0441\u0442\u0440\u0435\u0435). overrides \u2014 \u043F\u0440\u0430\u0432\u043A\u0438 \u0438\u0437 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F: match (\u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430 \u043E\u0431\u0440\u0430\u0437\u0446\u0430), \u0438 \u043B\u0438\u0431\u043E new_date, \u043B\u0438\u0431\u043E shift_days; \u0435\u0449\u0451 skip (\u043D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C) \u0438 title (\u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C). \u041F\u0440\u0430\u0432\u043A\u0430 \u0434\u0432\u0438\u0433\u0430\u0435\u0442 \u0438 \u0442\u043E, \u0447\u0442\u043E \u0441\u0442\u043E\u0438\u0442 \u0437\u0430 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u043C \u043F\u043E \u0441\u0432\u044F\u0437\u044F\u043C. \u041F\u041E \u0423\u041C\u041E\u041B\u0427\u0410\u041D\u0418\u042E \u041D\u0418\u0427\u0415\u0413\u041E \u041D\u0415 \u0417\u0410\u041F\u0418\u0421\u042B\u0412\u0410\u0415\u0422: \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0440\u0430\u0437\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D \u043D\u0430 \u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0443, \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 apply=true. \u041D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438, \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u0442\u044B, \u0441\u0442\u0430\u0442\u0443\u0441\u044B \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438.",
  inputSchema: {
    template_project_id: z18.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430-\u043E\u0431\u0440\u0430\u0437\u0446\u0430 (task_groups.id)."),
    target_project_id: z18.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043A\u0443\u0434\u0430 \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0442\u044C. \u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u2014 create_project."),
    start_date: z18.string().describe("\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430, ISO datetime."),
    scale: z18.number().min(0.05).max(10).optional().describe("\u0421\u0436\u0430\u0442\u044C \u0438\u043B\u0438 \u0440\u0430\u0441\u0442\u044F\u043D\u0443\u0442\u044C \u043F\u043B\u0430\u043D. 1 \u2014 \u043A\u0430\u043A \u0432 \u043E\u0431\u0440\u0430\u0437\u0446\u0435."),
    assignee_for_all: z18.string().optional().describe("\u0418\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0437\u0430\u0434\u0430\u0447 \u043F\u043B\u0430\u043D\u0430: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u2014 \u0432\u044B."),
    overrides: z18.array(
      z18.object({
        match: z18.string().min(1).describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430 \u043E\u0431\u0440\u0430\u0437\u0446\u0430."),
        new_date: z18.string().optional().describe("\u041F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u044D\u0442\u0443 \u0434\u0430\u0442\u0443."),
        shift_days: z18.number().int().min(-3650).max(3650).optional().describe("\u0421\u0434\u0432\u0438\u043D\u0443\u0442\u044C \u043E\u0442 \u0440\u0430\u0437\u043B\u043E\u0436\u0435\u043D\u043D\u043E\u0439 \u0434\u0430\u0442\u044B."),
        skip: z18.boolean().optional().describe("\u041D\u0435 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0438\u0442\u044C \u0432 \u043D\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D."),
        title: z18.string().min(1).max(500).optional().describe("\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C.")
      })
    ).optional(),
    apply: z18.boolean().optional().describe("true \u2014 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E false: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    if (input.template_project_id === input.target_project_id) {
      return fail("\u041E\u0431\u0440\u0430\u0437\u0435\u0446 \u0438 \u0446\u0435\u043B\u044C \u2014 \u043E\u0434\u0438\u043D \u0438 \u0442\u043E\u0442 \u0436\u0435 \u043F\u0440\u043E\u0435\u043A\u0442: \u043F\u043B\u0430\u043D \u0443\u0434\u0432\u043E\u0438\u043B\u0441\u044F \u0431\u044B \u0441\u0430\u043C \u0432 \u0441\u0435\u0431\u0435");
    }
    const { data: projects, error: pErr } = await supabase.from("task_groups").select("id,name").in("id", [input.template_project_id, input.target_project_id]);
    if (pErr) return fail(pErr.message);
    const template = (projects ?? []).find((p) => p.id === input.template_project_id);
    const target = (projects ?? []).find((p) => p.id === input.target_project_id);
    if (!template) return fail("\u041F\u0440\u043E\u0435\u043A\u0442-\u043E\u0431\u0440\u0430\u0437\u0435\u0446 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    if (!target) return fail("\u041F\u0440\u043E\u0435\u043A\u0442-\u0446\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    let assignee = { id: uid, name: "\u0432\u044B" };
    if (input.assignee_for_all) {
      const r = await resolveUser(supabase, input.assignee_for_all);
      if ("error" in r) return fail(r.error);
      assignee = r;
    }
    const { data: tasks, error: tErr } = await supabase.from("tasks").select("id,title,start_at,deadline", { count: "exact" }).eq("group_id", input.template_project_id).or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)").limit(MAX_ITEMS2);
    if (tErr) return fail(tErr.message);
    const { data: milestones, error: mErr } = await supabase.from("project_milestones").select("id,name,planned_date").eq("group_id", input.template_project_id);
    if (mErr) return fail(mErr.message);
    const items = [
      ...(tasks ?? []).map((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        start: t.start_at,
        end: t.deadline
      })),
      ...(milestones ?? []).map((m) => ({
        id: m.id,
        kind: "milestone",
        title: m.name,
        start: null,
        end: m.planned_date
      }))
    ];
    if (items.length === 0) return fail(`\u0412 \u043F\u0440\u043E\u0435\u043A\u0442\u0435 \xAB${template.name}\xBB \u043D\u0435\u0442 \u043D\u0438 \u0437\u0430\u0434\u0430\u0447, \u043D\u0438 \u0432\u0435\u0445 \u2014 \u043E\u0431\u0440\u0430\u0437\u0446\u0430 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F`);
    if (items.length >= MAX_ITEMS2) {
      return fail(`\u0412 \u043E\u0431\u0440\u0430\u0437\u0446\u0435 \u0431\u043E\u043B\u044C\u0448\u0435 ${MAX_ITEMS2} \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432 \u2014 \u0441\u0442\u043E\u043B\u044C\u043A\u043E \u0437\u0430 \u043E\u0434\u0438\u043D \u0432\u044B\u0437\u043E\u0432 \u043D\u0435 \u0440\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C. \u0412\u043E\u0437\u044C\u043C\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442 \u043F\u043E\u043C\u0435\u043D\u044C\u0448\u0435 \u0438\u043B\u0438 \u0440\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u0435 \u043F\u043B\u0430\u043D \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u0447\u0435\u0440\u0435\u0437 upsert_plan.`);
    }
    const ids = items.map((i) => i.id);
    const inScope = new Set(ids);
    const seen = /* @__PURE__ */ new Set();
    const links = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      for (const column of ["predecessor_id", "successor_id"]) {
        const { data, error } = await supabase.from("task_dependencies").select("predecessor_id,successor_id,dependency_type,lag_days").in(column, chunk);
        if (error) return fail(error.message);
        for (const d of data ?? []) {
          const key = `${d.predecessor_id}>${d.successor_id}`;
          if (seen.has(key) || !inScope.has(d.predecessor_id) || !inScope.has(d.successor_id)) continue;
          seen.add(key);
          links.push({ from: d.predecessor_id, to: d.successor_id, type: d.dependency_type, lag_days: d.lag_days });
        }
      }
    }
    const plan = layoutPlan({
      items,
      links,
      startDate: input.start_date,
      scale: input.scale,
      overrides: input.overrides
    });
    if (plan.problems.length) {
      return fail(
        `\u041F\u043B\u0430\u043D \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u0430\u043D, ${plan.problems.length === 1 ? "\u043C\u0435\u0448\u0430\u0435\u0442" : "\u043C\u0435\u0448\u0430\u044E\u0442"}:
\u2014 ${plan.problems.join("\n\u2014 ")}`
      );
    }
    const shown = {
      template: { id: template.id, name: template.name, anchor: plan.template_anchor },
      target: { id: target.id, name: target.name },
      assignee: assignee.name,
      span_days: planSpanDays(plan.items),
      items: plan.items.map((i) => ({
        kind: i.kind,
        title: i.title,
        start: i.start,
        end: i.end,
        overridden: i.overridden,
        moved_by_links: i.moved_by_links
      })),
      links: plan.links.length,
      skipped: plan.skipped
    };
    if (!input.apply) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              written: false,
              checked: true,
              plan: shown,
              counts: {
                tasks: plan.items.filter((i) => i.kind === "task").length,
                milestones: plan.items.filter((i) => i.kind === "milestone").length,
                links: plan.links.length
              },
              apply_with: "\u0442\u043E\u0442 \u0436\u0435 \u0432\u044B\u0437\u043E\u0432 \u0441 apply=true, \u043F\u043E\u0441\u043B\u0435 \u0442\u043E\u0433\u043E \u043A\u0430\u043A \u0447\u0435\u043B\u043E\u0432\u0435\u043A \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u043B \u0434\u0430\u0442\u044B",
              not_copied: "\u043E\u0442\u043C\u0435\u0442\u043A\u0438 \u043E \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0438, \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0434\u0430\u0442\u044B, \u0441\u0442\u0430\u0442\u0443\u0441\u044B, \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 \u043E\u0431\u0440\u0430\u0437\u0446\u0430"
            })
          }
        ]
      };
    }
    const newId = /* @__PURE__ */ new Map();
    const done = [];
    const warnings = [];
    const stop = (msg) => fail(
      `\u0417\u0430\u043F\u0438\u0441\u044C \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430: ${msg}
\u0423\u0441\u043F\u0435\u043B\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F: ${done.length ? done.join("; ") : "\u043D\u0438\u0447\u0435\u0433\u043E"}.
\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u044B\u0439 \u0432\u044B\u0437\u043E\u0432 \u0441\u043E\u0437\u0434\u0430\u0441\u0442 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B \u0437\u0430\u043D\u043E\u0432\u043E \u2014 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0438\u0442\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.`
    );
    const { data: lastMs } = await supabase.from("project_milestones").select("position").eq("group_id", input.target_project_id).order("position", { ascending: false }).limit(1).maybeSingle();
    let position = (lastMs?.position ?? 0) + 1;
    for (const it of plan.items) {
      if (it.kind === "task") {
        const created = await insertTask(
          supabase,
          uid,
          {
            title: it.title,
            deadline: it.end,
            start_at: it.start,
            group_id: input.target_project_id,
            assigned_to: assignee.id,
            status_meta: {
              created_by: "claude",
              created_via: "mcp",
              // По какому проекту сделан план — видно потом без догадок.
              source: { kind: "plan", template_project_id: template.id, template_task_id: it.source_id }
            }
          },
          // Одно уведомление на весь план, а не на каждую задачу: двадцать
          // писем подряд человек просто отключит.
          { notifyAssignee: false }
        );
        if ("error" in created) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443 \xAB${it.title}\xBB: ${created.error}`);
        warnings.push(...created.warnings);
        newId.set(it.source_id, created.task.id);
        done.push(`\u0437\u0430\u0434\u0430\u0447\u0430 \xAB${it.title}\xBB`);
      } else {
        const { data: ms, error } = await supabase.from("project_milestones").insert({
          group_id: input.target_project_id,
          name: it.title,
          planned_date: it.end,
          status: "pending",
          color: "#3b82f6",
          created_by: uid,
          position: position++
        }).select("id").single();
        if (error) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0432\u0435\u0445\u0443 \xAB${it.title}\xBB: ${error.message}`);
        newId.set(it.source_id, ms.id);
        done.push(`\u0432\u0435\u0445\u0430 \xAB${it.title}\xBB`);
      }
    }
    const kindOf = new Map(plan.items.map((i) => [i.source_id, i.kind]));
    let linked = 0;
    for (const l of plan.links) {
      const from = newId.get(l.from);
      const to = newId.get(l.to);
      if (!from || !to) continue;
      const { error } = await supabase.from("task_dependencies").insert({
        predecessor_id: from,
        successor_id: to,
        dependency_type: l.type,
        lag_days: l.lag_days,
        predecessor_entity_type: kindOf.get(l.from) ?? "task",
        successor_entity_type: kindOf.get(l.to) ?? "task",
        created_by: uid
      });
      if (error) return stop(`\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0432\u044F\u0437\u044C: ${error.message}`);
      linked++;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: true,
            plan: shown,
            created: { tasks: plan.items.filter((i) => i.kind === "task").length, milestones: plan.items.filter((i) => i.kind === "milestone").length, links: linked },
            assignee: assignee.name,
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/get_baseline.ts
import { defineTool as defineTool19 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z19 } from "npm:zod@^4.4.3";
var get_baseline_default = defineTool19({
  name: "get_baseline",
  title: "\u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430: planning (\u043F\u043B\u0430\u043D \u0435\u0449\u0451 \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u2014 \u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u0440\u043E\u043A\u043E\u0432 \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F \u0441\u0434\u0432\u0438\u0433\u043E\u043C) \u0438\u043B\u0438 locked (\u043F\u043B\u0430\u043D \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D \u2014 \u043A\u0430\u0436\u0434\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435). \u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u043A\u0442\u043E \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0449\u0438\u0439, \u043A\u043E\u0433\u0434\u0430 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447 \u0443\u0436\u0435 \u0441 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435\u043C \u0438 \u0447\u0435\u0440\u0435\u0437 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0447\u0430\u0441\u043E\u0432 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F. \u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0435\u0434 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u043E\u043C \u0441\u0440\u043E\u043A\u043E\u0432: \u043E\u0442 \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u0437\u0430\u0432\u0438\u0441\u0438\u0442, \u0431\u0443\u0434\u0435\u0442 \u043B\u0438 \u0441\u0434\u0432\u0438\u0433 \u0437\u0430\u043F\u0438\u0441\u0430\u043D \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u044C.",
  inputSchema: {
    project_id: z19.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id).")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const { data: project, error } = await supabase.from("task_groups").select("id,name,parent_id,work_mode,baseline_status,baseline_locked_at,baseline_approver_id,baseline_auto_lock_hours,created_at").eq("id", input.project_id).maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    let parent = null;
    if (project.parent_id) {
      const { data } = await supabase.from("task_groups").select("id,name,baseline_status").eq("id", project.parent_id).maybeSingle();
      parent = data ?? null;
    }
    const planning = project.baseline_status === "planning" || parent?.baseline_status === "planning";
    let approver = null;
    if (project.baseline_approver_id) {
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", project.baseline_approver_id).maybeSingle();
      approver = data?.display_name ?? data?.email ?? null;
    }
    const isFlow = project.work_mode === "flow";
    const hours = project.baseline_auto_lock_hours ?? 48;
    let autoLock = null;
    if (!isFlow && planning && project.baseline_status === "planning" && !project.parent_id) {
      const at = new Date(new Date(project.created_at).getTime() + hours * 36e5);
      autoLock = { at: at.toISOString(), hours_left: Math.round((at.getTime() - Date.now()) / 36e5) };
    }
    const { data: tasks, error: tErr } = await supabase.from("tasks").select("id,deadline,original_deadline").eq("group_id", input.project_id).not("deadline", "is", null).limit(2e3);
    if (tErr) return fail(tErr.message);
    let drifted = 0;
    let maxDrift = 0;
    let withoutBaseline = 0;
    for (const t of tasks ?? []) {
      if (!t.original_deadline) {
        withoutBaseline++;
        continue;
      }
      const d = driftDays(t.original_deadline, t.deadline);
      if (d === null || d === 0) continue;
      drifted++;
      if (Math.abs(d) > Math.abs(maxDrift)) maxDrift = d;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            project: { id: project.id, name: project.name },
            status: project.baseline_status,
            work_mode: project.work_mode ?? null,
            counts_as_planning: planning,
            meaning: isFlow ? "\u042D\u0442\u043E \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u043F\u043E\u0442\u043E\u043A: \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043A \u043D\u0435\u043C\u0443 \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F, \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u0435\u0433\u043E \u043D\u0435 \u0442\u0440\u043E\u0433\u0430\u0435\u0442. \u0415\u0441\u043B\u0438 \u043E\u043D \u0432\u0441\u0451 \u0436\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D \u2014 \u0441\u043D\u0438\u043C\u0438\u0442\u0435 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044E, \u0438\u043D\u0430\u0447\u0435 \u043A\u0430\u0436\u0434\u044B\u0439 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0441\u0440\u043E\u043A\u0430 \u043F\u043E\u043F\u0430\u0434\u0451\u0442 \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u044C \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435." : planning ? "\u041F\u043B\u0430\u043D \u0441\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442\u0441\u044F: \u0431\u0430\u0437\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430 \u0438\u0434\u0451\u0442 \u0437\u0430 \u0441\u0440\u043E\u043A\u043E\u043C, \u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u0434\u0432\u0438\u0433\u043E\u043C \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F." : "\u041F\u043B\u0430\u043D \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D: \u043A\u0430\u0436\u0434\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u0440\u043E\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u044C.",
            locked_at: project.baseline_locked_at,
            approver,
            parent: parent ? { id: parent.id, name: parent.name, status: parent.baseline_status } : null,
            auto_lock: autoLock,
            auto_lock_hours: isFlow ? null : hours,
            tasks: {
              with_deadline: (tasks ?? []).length,
              drifted,
              max_drift_days: maxDrift || null,
              without_baseline: withoutBaseline
            }
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/lock_baseline.ts
import { defineTool as defineTool20 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z20 } from "npm:zod@^4.4.3";
var lock_baseline_default = defineTool20({
  name: "lock_baseline",
  title: "\u0417\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D",
  description: "\u0424\u0438\u043A\u0441\u0438\u0440\u0443\u0435\u0442 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D \u043F\u0440\u043E\u0435\u043A\u0442\u0430: \u0441 \u044D\u0442\u043E\u0433\u043E \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u043A\u0430\u0436\u0434\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u0441\u0440\u043E\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u044C. \u0411\u0430\u0437\u043E\u0432\u044B\u0435 \u0434\u0430\u0442\u044B \u0432\u0441\u0435\u0445 \u0437\u0430\u0434\u0430\u0447 \u0441\u043E \u0441\u0440\u043E\u043A\u043E\u043C \u043F\u0440\u0438\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u044E\u0442\u0441\u044F \u043A \u0442\u0435\u043A\u0443\u0449\u0438\u043C \u0441\u0440\u043E\u043A\u0430\u043C \u2014 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u0434\u043E \u044D\u0442\u043E\u0433\u043E \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u044F \u041E\u0411\u041D\u0423\u041B\u042F\u042E\u0422\u0421\u042F \u0438 \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044E \u043D\u0435 \u043F\u043E\u0434\u043B\u0435\u0436\u0430\u0442. \u041F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0444\u0438\u043A\u0441\u0438\u0440\u0443\u044E\u0442\u0441\u044F \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C, \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0449\u0438\u0439 \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435. \u041F\u041E \u0423\u041C\u041E\u041B\u0427\u0410\u041D\u0418\u042E \u041D\u0418\u0427\u0415\u0413\u041E \u041D\u0415 \u041F\u0418\u0428\u0415\u0422: \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442, \u0447\u0442\u043E \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u0442\u0440\u043E\u043D\u0443\u0442\u043E; \u0437\u0430\u043F\u0438\u0441\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 apply=true, \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430.",
  inputSchema: {
    project_id: z20.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id)."),
    approver: z20.string().optional().describe("\u0423\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E\u0449\u0438\u0439: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F. \u0417\u0430\u0434\u0430\u0451\u0442\u0441\u044F \u0437\u0430\u043E\u0434\u043D\u043E \u0441 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0435\u0439."),
    auto_lock_hours: z20.number().int().min(1).max(8760).optional().describe("\u0427\u0435\u0440\u0435\u0437 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0447\u0430\u0441\u043E\u0432 \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0435\u0442 \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 48)."),
    apply: z20.boolean().optional().describe("true \u2014 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E false: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u043F\u043E\u0441\u043B\u0435\u0434\u0441\u0442\u0432\u0438\u044F.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const { data: project, error } = await supabase.from("task_groups").select("id,name,baseline_status,baseline_approver_id,baseline_locked_at").eq("id", input.project_id).maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    let approver = null;
    if (input.approver) {
      const r = await resolveUser(supabase, input.approver);
      if ("error" in r) return fail(r.error);
      approver = r;
    }
    const { data: subs } = await supabase.from("task_groups").select("id,name").eq("parent_id", project.id);
    const groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
    const { data: tasks, error: tErr } = await supabase.from("tasks").select("id,title,deadline,original_deadline").in("group_id", groupIds).not("deadline", "is", null).limit(2e3);
    if (tErr) return fail(tErr.message);
    const rows = tasks ?? [];
    const erased = rows.map((t) => ({ title: t.title, drift: t.original_deadline ? driftDays(t.original_deadline, t.deadline) : null })).filter((r) => r.drift !== null && r.drift !== 0).sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
    const summary = {
      project: { id: project.id, name: project.name, status: project.baseline_status },
      already_locked: project.baseline_status === "locked",
      subprojects: (subs ?? []).map((s) => s.name),
      tasks_to_rebaseline: rows.length,
      drift_to_be_erased: {
        tasks: erased.length,
        // Показываем самые крупные: список из 200 строк человек не прочтёт, а
        // «стирается отклонение 45 дней у такой-то задачи» — прочтёт.
        biggest: erased.slice(0, 5).map((r) => ({ title: r.title, drift_days: r.drift }))
      },
      approver: approver?.name ?? null,
      auto_lock_hours: input.auto_lock_hours ?? null
    };
    if (!input.apply) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              written: false,
              will_do: summary,
              warning: erased.length > 0 ? `\u041F\u043E\u0441\u043B\u0435 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438 ${erased.length} \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0439 \u0441\u0442\u0430\u043D\u0443\u0442 \u043D\u0443\u043B\u0435\u0432\u044B\u043C\u0438, \u0438 \u0432\u0435\u0440\u043D\u0443\u0442\u044C \u044D\u0442\u0438 \u0447\u0438\u0441\u043B\u0430 \u0431\u0443\u0434\u0435\u0442 \u043D\u0435\u0447\u0435\u043C. \u041F\u043E\u043A\u0430\u0436\u0438\u0442\u0435 \u044D\u0442\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0434\u043E \u0437\u0430\u043F\u0438\u0441\u0438.` : "\u041D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0445 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0439 \u043D\u0435\u0442 \u2014 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0441\u043E\u0442\u0440\u0451\u0442.",
              apply_with: "\u0442\u043E\u0442 \u0436\u0435 \u0432\u044B\u0437\u043E\u0432 \u0441 apply=true"
            })
          }
        ]
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const warnings = [];
    if (approver || input.auto_lock_hours !== void 0) {
      const settings = {};
      if (approver) settings.baseline_approver_id = approver.id;
      if (input.auto_lock_hours !== void 0) settings.baseline_auto_lock_hours = input.auto_lock_hours;
      const { error: sErr } = await supabase.from("task_groups").update(settings).eq("id", project.id);
      if (sErr) return fail(`\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B: ${sErr.message}`);
      if (approver && approver.id !== project.baseline_approver_id) {
        await notify(supabase, "baseline_approver_assigned", project.name, [approver.id], null);
      }
    }
    const { data: locked, error: lErr } = await supabase.from("task_groups").update({ baseline_status: "locked", baseline_locked_at: now }).in("id", groupIds).select("id");
    if (lErr) return fail(lErr.message);
    if (!locked?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044E \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430 \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430");
    if (locked.length < groupIds.length) {
      warnings.push(`\u043F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043E ${locked.length - 1} \u0438\u0437 ${groupIds.length - 1} \u2014 \u043D\u0430 \u043E\u0441\u0442\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432`);
    }
    let rebaselined = 0;
    for (const t of rows) {
      const { error: uErr } = await supabase.from("tasks").update({ original_deadline: t.deadline }).eq("id", t.id);
      if (uErr) {
        warnings.push(`\u0431\u0430\u0437\u043E\u0432\u0430\u044F \u0434\u0430\u0442\u0430 \u043D\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430 \u0443 \xAB${t.title}\xBB: ${uErr.message}`);
        continue;
      }
      rebaselined++;
    }
    const approverId = approver?.id ?? project.baseline_approver_id;
    if (approverId && approverId !== uid) {
      await notify(supabase, "baseline_locked", project.name, [approverId], null);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: true,
            project: { id: project.id, name: project.name },
            status: "locked",
            locked_at: now,
            rebaselined_tasks: rebaselined,
            drift_erased: erased.length,
            approver: approver?.name ?? null,
            note: "\u0421 \u044D\u0442\u043E\u0433\u043E \u043C\u043E\u043C\u0435\u043D\u0442\u0430 \u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u0440\u043E\u043A\u043E\u0432 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u043E\u0442 \u043F\u043B\u0430\u043D\u0430.",
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/unlock_baseline.ts
import { defineTool as defineTool21 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z21 } from "npm:zod@^4.4.3";
var unlock_baseline_default = defineTool21({
  name: "unlock_baseline",
  title: "\u0421\u043D\u044F\u0442\u044C \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044E \u0431\u0430\u0437\u043E\u0432\u043E\u0433\u043E \u043F\u043B\u0430\u043D\u0430",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u0440\u043E\u0435\u043A\u0442 \u043A \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044E: \u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u0440\u043E\u043A\u043E\u0432 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u044E\u0442 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0442\u044C\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435. \u0411\u0430\u0437\u043E\u0432\u044B\u0435 \u0434\u0430\u0442\u044B \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u2014 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u044F \u043E\u0441\u0442\u0430\u044E\u0442\u0441\u044F \u0432\u0438\u0434\u043D\u044B, \u043F\u043E\u043A\u0430 \u0441\u0440\u043E\u043A\u0438 \u043D\u0435 \u043F\u043E\u043F\u0440\u0430\u0432\u044F\u0442 \u0437\u0430\u043D\u043E\u0432\u043E. \u041F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u044B \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0432\u043C\u0435\u0441\u0442\u0435 \u0441 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C. \u0412\u041D\u0418\u041C\u0410\u041D\u0418\u0415: \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u043E\u0442\u0441\u0447\u0438\u0442\u044B\u0432\u0430\u0435\u0442 \u0447\u0430\u0441\u044B \u043E\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u0442\u0430\u0440\u0448\u0435 \u044D\u0442\u043E\u0433\u043E \u0441\u0440\u043E\u043A\u0430 \u043F\u043B\u0430\u043D \u0432\u0435\u0440\u043D\u0451\u0442\u0441\u044F \u043A \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u043C\u0443 \u0441\u0430\u043C, \u043F\u0440\u0438 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438 \u2014 \u0435\u0441\u043B\u0438 \u044D\u0442\u043E \u043D\u0435 \u0442\u043E, \u0447\u0442\u043E \u043D\u0443\u0436\u043D\u043E, \u0443\u0432\u0435\u043B\u0438\u0447\u044C\u0442\u0435 auto_lock_hours \u0447\u0435\u0440\u0435\u0437 lock_baseline.",
  inputSchema: {
    project_id: z21.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430 (task_groups.id).")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const { data: project, error } = await supabase.from("task_groups").select("id,name,baseline_status,baseline_auto_lock_hours,created_at").eq("id", input.project_id).maybeSingle();
    if (error) return fail(error.message);
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", project.id);
    const groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
    const { data: updated, error: uErr } = await supabase.from("task_groups").update({ baseline_status: "planning", baseline_locked_at: null }).in("id", groupIds).select("id");
    if (uErr) return fail(uErr.message);
    if (!updated?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0441\u043D\u044F\u0442\u0438\u0435 \u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438 \u0443 \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430");
    const hours = project.baseline_auto_lock_hours ?? 48;
    const autoLockAt = new Date(new Date(project.created_at).getTime() + hours * 36e5);
    const overdue = autoLockAt.getTime() <= Date.now();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            written: true,
            project: { id: project.id, name: project.name },
            status: "planning",
            was: project.baseline_status,
            subprojects_opened: updated.length - 1,
            note: "\u041F\u0440\u0430\u0432\u043A\u0438 \u0441\u0440\u043E\u043A\u043E\u0432 \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u043A\u0430\u043A \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435. \u0411\u0430\u0437\u043E\u0432\u044B\u0435 \u0434\u0430\u0442\u044B \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u043C\u0435\u043D\u044F\u043B\u0438\u0441\u044C.",
            auto_lock_warning: overdue ? `\u0410\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u0441\u0447\u0438\u0442\u0430\u0435\u0442 ${hours} \u0447 \u043E\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0430 \u043E\u043D \u0441\u043E\u0437\u0434\u0430\u043D \u0440\u0430\u043D\u044C\u0448\u0435 \u2014 \u043F\u043B\u0430\u043D \u0432\u0435\u0440\u043D\u0451\u0442\u0441\u044F \u043A \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D\u043D\u043E\u043C\u0443 \u043F\u0440\u0438 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u043C \u0437\u0430\u043F\u0443\u0441\u043A\u0435 \u0430\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u0438. \u0427\u0442\u043E\u0431\u044B \u044D\u0442\u043E\u0433\u043E \u043D\u0435 \u0441\u043B\u0443\u0447\u0438\u043B\u043E\u0441\u044C, \u0443\u0432\u0435\u043B\u0438\u0447\u044C\u0442\u0435 auto_lock_hours \u0447\u0435\u0440\u0435\u0437 lock_baseline.` : `\u0410\u0432\u0442\u043E\u0444\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 ${autoLockAt.toISOString()}.`
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/list_members.ts
import { defineTool as defineTool22 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z22 } from "npm:zod@^4.4.3";
var list_members_default = defineTool22({
  name: "list_members",
  title: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430",
  description: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430: \u043A\u0442\u043E \u0441\u043E\u0441\u0442\u043E\u0438\u0442 \u0438 \u0441 \u043A\u0430\u043A\u043E\u0439 \u0440\u043E\u043B\u044C\u044E. \u041D\u0443\u0436\u0435\u043D, \u0447\u0442\u043E\u0431\u044B \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u0438 \u043F\u043E\u043D\u044F\u0442\u044C, \u043E \u0447\u044C\u0435\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0435 \u0440\u0435\u0447\u044C. \u0411\u0435\u0437 project_id \u2014 \u043B\u044E\u0434\u0438 \u0438\u0437 \u0432\u0441\u0435\u0445 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u0432, \u0433\u0434\u0435 \u0441\u043E\u0441\u0442\u043E\u0438\u0442\u0435 \u0432\u044B.",
  inputSchema: {
    project_id: z22.string().uuid().optional().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0411\u0435\u0437 \u043D\u0435\u0433\u043E \u2014 \u043F\u043E \u0432\u0441\u0435\u043C \u0432\u0430\u0448\u0438\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    let groupIds;
    if (input.project_id) {
      const { data: project } = await supabase.from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
      if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
      groupIds = [project.id];
    } else {
      const { data: mine, error: error2 } = await supabase.from("group_members").select("group_id").eq("user_id", uid);
      if (error2) return fail(error2.message);
      groupIds = [...new Set((mine ?? []).map((m) => m.group_id))];
      if (groupIds.length === 0) return fail("\u0412\u044B \u043D\u0435 \u0441\u043E\u0441\u0442\u043E\u0438\u0442\u0435 \u043D\u0438 \u0432 \u043E\u0434\u043D\u043E\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u0435");
    }
    const { data: rows, error } = await supabase.from("group_members").select("user_id,role,group_id").in("group_id", groupIds);
    if (error) return fail(error.message);
    const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profiles } = await supabase.from("profiles").select("id,display_name,email,work_email").in("id", userIds).is("deleted_at", null);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const people = /* @__PURE__ */ new Map();
    for (const r of rows ?? []) {
      const p = byId.get(r.user_id);
      if (!p) continue;
      const entry = people.get(r.user_id) ?? {
        id: r.user_id,
        name: p.display_name ?? p.email ?? r.user_id,
        email: p.work_email ?? p.email ?? null,
        roles: /* @__PURE__ */ new Set(),
        projects: 0
      };
      if (r.role) entry.roles.add(r.role);
      entry.projects++;
      people.set(r.user_id, entry);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            scope: input.project_id ? { project_id: input.project_id } : { projects: groupIds.length },
            members: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "ru")).map((p) => ({
              id: p.id,
              name: p.name,
              email: p.email,
              roles: [...p.roles],
              ...input.project_id ? {} : { in_projects: p.projects }
            })),
            count: people.size
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/get_workload.ts
import { defineTool as defineTool23 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z23 } from "npm:zod@^4.4.3";

// src/lib/workload.ts
import { differenceInCalendarDays as differenceInCalendarDays5, parseISO as parseISO5 } from "npm:date-fns@^3.6.0";
var DAY3 = 864e5;
function computeWorkload(tasks, windowFrom, windowTo, now = /* @__PURE__ */ new Date()) {
  const from = parseISO5(windowFrom).getTime();
  const to = parseISO5(windowTo).getTime();
  const byPerson = /* @__PURE__ */ new Map();
  let unassigned = 0;
  let skipped = 0;
  for (const t of tasks) {
    if (t.is_completed) continue;
    if (!t.assignee_id) {
      unassigned++;
      continue;
    }
    if (!t.end) {
      skipped++;
      if (!byPerson.has(t.assignee_id)) byPerson.set(t.assignee_id, []);
      byPerson.get(t.assignee_id).push(t);
      continue;
    }
    const start = t.start ? parseISO5(t.start).getTime() : parseISO5(t.end).getTime();
    const end = parseISO5(t.end).getTime();
    if (end < from || start > to) continue;
    if (!byPerson.has(t.assignee_id)) byPerson.set(t.assignee_id, []);
    byPerson.get(t.assignee_id).push(t);
  }
  const people = [];
  for (const [assignee_id, list] of byPerson) {
    const dated = list.filter((t) => t.end);
    const undated = list.length - dated.length;
    let peak = 0;
    let peakDay = null;
    const days = Math.max(0, differenceInCalendarDays5(new Date(to), new Date(from)));
    for (let i = 0; i <= days; i++) {
      const day = from + i * DAY3;
      let count = 0;
      for (const t of dated) {
        const s = t.start ? parseISO5(t.start).getTime() : parseISO5(t.end).getTime();
        const e = parseISO5(t.end).getTime();
        if (s <= day + DAY3 - 1 && e >= day) count++;
      }
      if (count > peak) {
        peak = count;
        peakDay = new Date(day).toISOString();
      }
    }
    const overdue = dated.filter((t) => parseISO5(t.end).getTime() < now.getTime()).length;
    people.push({
      assignee_id,
      tasks_in_window: dated.length,
      peak_concurrent: peak,
      peak_day: peakDay,
      overdue,
      undated
    });
  }
  people.sort((a, b) => b.peak_concurrent - a.peak_concurrent || b.tasks_in_window - a.tasks_in_window);
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    people,
    unassigned,
    skipped_no_dates: skipped
  };
}

// src/lib/mcp/tools/get_workload.ts
var MAX_TASKS2 = 1e3;
var get_workload_default = defineTool23({
  name: "get_workload",
  title: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043B\u044E\u0434\u0435\u0439 \u043F\u043E \u0434\u0430\u0442\u0430\u043C",
  description: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u0443 \u043A\u043E\u0433\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447 \u0438\u0434\u0451\u0442 \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u0432 \u0437\u0430\u0434\u0430\u043D\u043D\u043E\u043C \u043E\u043A\u043D\u0435 \u0434\u0430\u0442: \u043F\u0438\u043A, \u0434\u0435\u043D\u044C \u043F\u0438\u043A\u0430, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E, \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u0434\u0430\u0447 \u0431\u0435\u0437 \u0441\u0440\u043E\u043A\u0430. \u041E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u043D\u0430 \xAB\u043A\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u0438\u043B\u0438 \u043F\u043B\u0430\u043D\u043E\u043C\xBB. \u0412\u0410\u0416\u041D\u041E: \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E \u0434\u0430\u0442\u0430\u043C \u2014 \u043E\u0446\u0435\u043D\u043E\u043A \u0442\u0440\u0443\u0434\u043E\u0451\u043C\u043A\u043E\u0441\u0442\u0438 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u044D\u0442\u043E \u0447\u0438\u0441\u043B\u043E \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447, \u0430 \u043D\u0435 \u0447\u0430\u0441\u044B \u0438 \u043D\u0435 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u044B \u0437\u0430\u043D\u044F\u0442\u043E\u0441\u0442\u0438. project_id \u2014 \u043F\u043E \u043E\u0434\u043D\u043E\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0443, \u0431\u0435\u0437 \u043D\u0435\u0433\u043E \u2014 \u043F\u043E \u0432\u0441\u0435\u043C \u0437\u0430\u0434\u0430\u0447\u0430\u043C, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0432\u0430\u043C \u0432\u0438\u0434\u043D\u044B \u0432 \u044D\u0442\u043E\u043C \u043E\u043A\u043D\u0435.",
  inputSchema: {
    from: z23.string().describe("\u041D\u0430\u0447\u0430\u043B\u043E \u043E\u043A\u043D\u0430, ISO datetime."),
    to: z23.string().describe("\u041A\u043E\u043D\u0435\u0446 \u043E\u043A\u043D\u0430, ISO datetime."),
    project_id: z23.string().uuid().optional().describe("\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0442\u044C \u043E\u0434\u043D\u0438\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C."),
    include_subprojects: z23.boolean().optional().describe("\u0421 \u043F\u043E\u0434\u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C\u0438. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0434\u0430.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (Number.isNaN(from.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${input.from}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
    if (Number.isNaN(to.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \xAB${input.to}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
    if (from > to) return fail("\u041D\u0430\u0447\u0430\u043B\u043E \u043E\u043A\u043D\u0430 \u043F\u043E\u0437\u0436\u0435 \u043A\u043E\u043D\u0446\u0430");
    const days = Math.round((to.getTime() - from.getTime()) / 864e5);
    if (days > 370) return fail(`\u041E\u043A\u043D\u043E ${days} \u0434\u043D\u0435\u0439 \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0432\u0435\u043B\u0438\u043A\u043E \u2014 \u0432\u043E\u0437\u044C\u043C\u0438\u0442\u0435 \u0434\u043E \u0433\u043E\u0434\u0430.`);
    let groupIds = null;
    if (input.project_id) {
      const { data: project } = await supabase.from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
      if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
      groupIds = [project.id];
      if (input.include_subprojects !== false) {
        const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", project.id);
        groupIds = [project.id, ...(subs ?? []).map((s) => s.id)];
      }
    }
    let q = supabase.from("tasks").select("id,title,assigned_to,start_at,deadline,is_completed", { count: "exact" }).eq("is_completed", false).not("deadline", "is", null).gte("deadline", from.toISOString()).lte("deadline", new Date(to.getTime() + 370 * 864e5).toISOString()).limit(MAX_TASKS2);
    if (groupIds) q = q.in("group_id", groupIds);
    const { data: tasks, error, count } = await q;
    if (error) return fail(error.message);
    const rows = (tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      assignee_id: t.assigned_to,
      start: t.start_at,
      end: t.deadline,
      is_completed: t.is_completed
    }));
    const load = computeWorkload(rows, from.toISOString(), to.toISOString(), /* @__PURE__ */ new Date());
    const ids = load.people.map((p) => p.assignee_id);
    const names = /* @__PURE__ */ new Map();
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? p.email ?? p.id);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            window: { from: load.from, to: load.to },
            scope: input.project_id ? { project_id: input.project_id } : "\u0432\u0441\u0435 \u0432\u0438\u0434\u0438\u043C\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
            measure: "\u0447\u0438\u0441\u043B\u043E \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447; \u043E\u0446\u0435\u043D\u043E\u043A \u0442\u0440\u0443\u0434\u043E\u0451\u043C\u043A\u043E\u0441\u0442\u0438 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u044D\u0442\u043E \u043D\u0435 \u0447\u0430\u0441\u044B \u0438 \u043D\u0435 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u044B \u0437\u0430\u043D\u044F\u0442\u043E\u0441\u0442\u0438",
            people: load.people.map((p) => ({
              name: names.get(p.assignee_id) ?? p.assignee_id,
              id: p.assignee_id,
              tasks_in_window: p.tasks_in_window,
              peak_concurrent: p.peak_concurrent,
              peak_day: p.peak_day,
              overdue: p.overdue
            })),
            unassigned_tasks: load.unassigned,
            truncated: (count ?? 0) > rows.length,
            ...(count ?? 0) > rows.length ? { truncated_note: `\u0412 \u043E\u043A\u043D\u043E \u043F\u043E\u043F\u0430\u0434\u0430\u0435\u0442 ${count} \u0437\u0430\u0434\u0430\u0447, \u043F\u043E\u0441\u0447\u0438\u0442\u0430\u043D\u043E ${rows.length}. \u0421\u0443\u0437\u044C\u0442\u0435 \u043E\u043A\u043D\u043E \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442.` } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/delete_plan_items.ts
import { defineTool as defineTool24 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z24 } from "npm:zod@^4.4.3";
var MAX = 50;
var delete_plan_items_default = defineTool24({
  name: "delete_plan_items",
  title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438",
  description: "\u0423\u0434\u0430\u043B\u044F\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0432\u0435\u0445\u0438 \u2014 \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0440\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043B\u0430\u043D \u0437\u0430\u043D\u043E\u0432\u043E. \u0423\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u041D\u0410\u0421\u0422\u041E\u042F\u0429\u0415\u0415: \u0432 JustTODOit \u043D\u0435\u0442 \u043A\u043E\u0440\u0437\u0438\u043D\u044B, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0435\u0447\u0435\u043C. \u041F\u041E \u0423\u041C\u041E\u041B\u0427\u0410\u041D\u0418\u042E \u041D\u0418\u0427\u0415\u0413\u041E \u041D\u0415 \u0423\u0414\u0410\u041B\u042F\u0415\u0422: \u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u044F\u0435\u0442, \u0447\u0442\u043E \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442 (\u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044F, \u043F\u043E\u0434\u0437\u0430\u0434\u0430\u0447\u0438, \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438, \u0441\u0432\u044F\u0437\u0438); \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 apply=true, \u043F\u043E\u0441\u043B\u0435 \u044F\u0432\u043D\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430. \u0412\u0441\u0435 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B \u0434\u043E\u043B\u0436\u043D\u044B \u0431\u044B\u0442\u044C \u0438\u0437 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u043D\u0435 \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F \u0431\u0435\u0437 include_completed=true \u2014 \u044D\u0442\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u044B, \u0430 \u043D\u0435 \u043F\u043B\u0430\u043D.",
  inputSchema: {
    project_id: z24.string().uuid().describe("UUID \u043F\u0440\u043E\u0435\u043A\u0442\u0430, \u0438\u0437 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0443\u0434\u0430\u043B\u044F\u0435\u043C \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442\u0441\u044F \u0443 \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430."),
    ids: z24.array(z24.string().uuid()).min(1).max(MAX).describe("UUID \u0437\u0430\u0434\u0430\u0447 \u0438/\u0438\u043B\u0438 \u0432\u0435\u0445."),
    include_completed: z24.boolean().optional().describe("\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u044C \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447."),
    apply: z24.boolean().optional().describe("true \u2014 \u0443\u0434\u0430\u043B\u0438\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E false: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C.")
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const supabase = db4(ctx);
    const ids = [...new Set(input.ids)];
    const { data: project } = await supabase.from("task_groups").select("id,name").eq("id", input.project_id).maybeSingle();
    if (!project) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    const { data: tasks, error: tErr } = await supabase.from("tasks").select("id,title,group_id,is_completed,subtasks(id),task_comments(id)").in("id", ids);
    if (tErr) return fail(tErr.message);
    const { data: milestones, error: mErr } = await supabase.from("project_milestones").select("id,name,group_id,actual_date").in("id", ids);
    if (mErr) return fail(mErr.message);
    const problems = [];
    const found = /* @__PURE__ */ new Set([...(tasks ?? []).map((t) => t.id), ...(milestones ?? []).map((m) => m.id)]);
    for (const id of ids) {
      if (!found.has(id)) problems.push(`${id}: \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430`);
    }
    for (const t of tasks ?? []) {
      if (t.group_id !== input.project_id) problems.push(`\xAB${t.title}\xBB: \u0438\u0437 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430`);
      if (t.is_completed && !input.include_completed) {
        problems.push(`\xAB${t.title}\xBB: \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430 \u2014 \u044D\u0442\u043E \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u0440\u0430\u0431\u043E\u0442\u044B. \u041D\u0443\u0436\u043D\u043E \u0443\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0451 \u0440\u0430\u0432\u043D\u043E \u2014 include_completed=true`);
      }
    }
    for (const m of milestones ?? []) {
      if (m.group_id !== input.project_id) problems.push(`\xAB${m.name}\xBB: \u0438\u0437 \u0434\u0440\u0443\u0433\u043E\u0433\u043E \u043F\u0440\u043E\u0435\u043A\u0442\u0430`);
      if (m.actual_date && !input.include_completed) {
        problems.push(`\xAB${m.name}\xBB: \u0432\u0435\u0445\u0430 \u0443\u0436\u0435 \u0434\u043E\u0441\u0442\u0438\u0433\u043D\u0443\u0442\u0430 ${m.actual_date}. \u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0432\u0441\u0451 \u0440\u0430\u0432\u043D\u043E \u2014 include_completed=true`);
      }
    }
    if (problems.length) {
      return fail(`\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u043E, ${problems.length === 1 ? "\u043C\u0435\u0448\u0430\u0435\u0442" : "\u043C\u0435\u0448\u0430\u044E\u0442"}:
\u2014 ${problems.join("\n\u2014 ")}`);
    }
    let linkCount = 0;
    for (const column of ["predecessor_id", "successor_id"]) {
      const { count } = await supabase.from("task_dependencies").select("id", { count: "exact", head: true }).in(column, ids);
      linkCount += count ?? 0;
    }
    const willDelete = {
      project: { id: project.id, name: project.name },
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.is_completed,
        subtasks: (t.subtasks ?? []).length,
        comments: (t.task_comments ?? []).length
      })),
      milestones: (milestones ?? []).map((m) => ({ id: m.id, name: m.name, achieved: !!m.actual_date })),
      links_that_disappear: linkCount
    };
    if (!input.apply) {
      const lost = willDelete.tasks.reduce((n, t) => n + t.subtasks + t.comments, 0);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              deleted: false,
              will_delete: willDelete,
              warning: `\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0435\u0447\u0435\u043C: \u043A\u043E\u0440\u0437\u0438\u043D\u044B \u0432 JustTODOit \u043D\u0435\u0442.` + (lost > 0 ? ` \u0412\u043C\u0435\u0441\u0442\u0435 \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0438\u0441\u0447\u0435\u0437\u043D\u0443\u0442 ${lost} \u043F\u043E\u0434\u0437\u0430\u0434\u0430\u0447 \u0438 \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432.` : "") + (linkCount > 0 ? ` \u0418 ${linkCount} \u0441\u0432\u044F\u0437\u0435\u0439 \u2014 \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0440\u0430\u0431\u043E\u0442 \u043F\u0440\u0438\u0434\u0451\u0442\u0441\u044F \u0437\u0430\u0434\u0430\u0432\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E.` : ""),
              apply_with: "\u0442\u043E\u0442 \u0436\u0435 \u0432\u044B\u0437\u043E\u0432 \u0441 apply=true, \u043F\u043E\u0441\u043B\u0435 \u044F\u0432\u043D\u043E\u0433\u043E \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430"
            })
          }
        ]
      };
    }
    const deleted = [];
    const warnings = [];
    for (const t of tasks ?? []) {
      const { data, error } = await supabase.from("tasks").delete().eq("id", t.id).select("id");
      if (error) {
        warnings.push(`\xAB${t.title}\xBB \u043D\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0430: ${error.message}`);
        continue;
      }
      if (!data?.length) {
        warnings.push(`\xAB${t.title}\xBB: \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435`);
        continue;
      }
      deleted.push(t.title);
    }
    for (const m of milestones ?? []) {
      const { data, error } = await supabase.from("project_milestones").delete().eq("id", m.id).select("id");
      if (error) {
        warnings.push(`\xAB${m.name}\xBB \u043D\u0435 \u0443\u0434\u0430\u043B\u0435\u043D\u0430: ${error.message}`);
        continue;
      }
      if (!data?.length) {
        warnings.push(`\xAB${m.name}\xBB: \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435`);
        continue;
      }
      deleted.push(m.name);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            deleted: true,
            count: deleted.length,
            names: deleted,
            links_gone: linkCount,
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/get_attention.ts
import { defineTool as defineTool25 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z25 } from "npm:zod@^4.4.3";

// src/lib/attention.ts
import { differenceInCalendarDays as differenceInCalendarDays6, parseISO as parseISO6, startOfDay } from "npm:date-fns@^3.6.0";
function bucketByUrgency(tasks, horizonDays, now = /* @__PURE__ */ new Date()) {
  const today = startOfDay(now);
  const out = { overdue: [], today: [], soon: [], later: 0, undated: [] };
  for (const t of tasks) {
    if (!t.deadline) {
      out.undated.push(t);
      continue;
    }
    const due = startOfDay(parseISO6(t.deadline));
    const days = differenceInCalendarDays6(due, today);
    if (days < 0) out.overdue.push({ ...t, days: -days });
    else if (days === 0) out.today.push(t);
    else if (days <= horizonDays) out.soon.push({ ...t, days });
    else out.later++;
  }
  out.overdue.sort((a, b) => b.days - a.days);
  out.soon.sort((a, b) => a.days - b.days);
  return out;
}
function milestonesAtRisk(milestones, horizonDays, now = /* @__PURE__ */ new Date()) {
  const today = startOfDay(now);
  const out = [];
  for (const m of milestones) {
    if (m.actual_date || !m.planned_date) continue;
    const days = differenceInCalendarDays6(startOfDay(parseISO6(m.planned_date)), today);
    if (days < 0) out.push({ ...m, days: -days, missed: true });
    else if (days <= horizonDays) out.push({ ...m, days, missed: false });
  }
  out.sort((a, b) => Number(b.missed) - Number(a.missed) || b.days - a.days);
  return out;
}

// src/lib/mcp/tools/get_attention.ts
var LIST = 10;
var get_attention_default = defineTool25({
  name: "get_attention",
  title: "\u0427\u0442\u043E \u0433\u043E\u0440\u0438\u0442",
  description: "\u0421\u0432\u043E\u0434\u043A\u0430 \u043F\u043E \u0412\u0421\u0415\u041C \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C \u0441\u0440\u0430\u0437\u0443, \u0431\u0435\u0437 \u0443\u043A\u0430\u0437\u0430\u043D\u0438\u044F \u043F\u0440\u043E\u0435\u043A\u0442\u0430: \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u0441\u0440\u043E\u043A\u0438 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F, \u043D\u0430 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442 \u0432\u043F\u0435\u0440\u0451\u0434, \u0437\u0430\u0434\u0430\u0447\u0438 \u0431\u0435\u0437 \u0441\u0440\u043E\u043A\u0430, \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u0438 \u043F\u0440\u0438\u0431\u043B\u0438\u0436\u0430\u044E\u0449\u0438\u0435\u0441\u044F \u0432\u0435\u0445\u0438, \u0441\u0430\u043C\u044B\u0435 \u0443\u0435\u0445\u0430\u0432\u0448\u0438\u0435 \u043E\u0442 \u043F\u043B\u0430\u043D\u0430 \u0437\u0430\u0434\u0430\u0447\u0438. \u041E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u043D\u0430 \xAB\u0447\u0442\u043E \u0433\u043E\u0440\u0438\u0442\xBB, \xAB\u0447\u0442\u043E \u043D\u0430 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0435\xBB, \xAB\u0447\u0442\u043E \u0443 \u043C\u0435\u043D\u044F \u0431\u0435\u0437 \u0441\u0440\u043E\u043A\u043E\u0432\xBB. scope: mine \u2014 \u0433\u0434\u0435 \u0432\u044B \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E), created_by_me \u2014 \u0447\u0442\u043E \u0432\u044B \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u043B\u0438 \u0434\u0440\u0443\u0433\u0438\u043C, person \u2014 \u0437\u0430 \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430. \u0427\u0438\u0441\u043B\u0430 \u043E\u0431\u0449\u0438\u0435 \u0438 \u0447\u0435\u0441\u0442\u043D\u044B\u0435, \u0441\u043F\u0438\u0441\u043A\u0438 \u043A\u043E\u0440\u043E\u0442\u043A\u0438\u0435 \u2014 \u043F\u043E \u0434\u0435\u0441\u044F\u0442\u044C \u0441\u0430\u043C\u044B\u0445 \u0432\u0430\u0436\u043D\u044B\u0445.",
  inputSchema: {
    horizon_days: z25.number().int().min(1).max(90).optional().describe("\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442 \xAB\u0441\u043A\u043E\u0440\u043E\xBB, \u0434\u043D\u0435\u0439. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 7."),
    scope: z25.enum(["mine", "created_by_me", "person"]).optional().describe("\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E mine."),
    person: z25.string().optional().describe("\u0414\u043B\u044F scope=person: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F."),
    project_id: z25.string().uuid().optional().describe("\u041E\u0433\u0440\u0430\u043D\u0438\u0447\u0438\u0442\u044C \u043E\u0434\u043D\u0438\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C, \u0435\u0441\u043B\u0438 \u043D\u0443\u0436\u043D\u043E.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const horizon = input.horizon_days ?? 7;
    const scope = input.scope ?? "mine";
    let who = { id: uid, name: "\u0432\u044B" };
    if (scope === "person") {
      if (!input.person) return fail("\u0414\u043B\u044F scope=person \u043D\u0443\u0436\u043D\u043E \u0443\u043A\u0430\u0437\u0430\u0442\u044C person");
      const r = await resolveUser(supabase, input.person);
      if ("error" in r) return fail(r.error);
      who = r;
    }
    let groupIds = null;
    if (input.project_id) {
      const { data: p } = await supabase.from("task_groups").select("id").eq("id", input.project_id).maybeSingle();
      if (!p) return fail("\u041F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
      const { data: subs } = await supabase.from("task_groups").select("id").eq("parent_id", p.id);
      groupIds = [p.id, ...(subs ?? []).map((s) => s.id)];
    }
    const base = () => {
      let q = supabase.from("tasks").select("id,title,deadline,original_deadline,group_id,assigned_to", { count: "exact" }).eq("is_completed", false).or("task_type.is.null,and(task_type.neq.stm_stage,task_type.neq.km_stage)");
      if (scope === "created_by_me") q = q.eq("user_id", uid);
      else q = q.eq("assigned_to", who.id);
      if (groupIds) q = q.in("group_id", groupIds);
      return q;
    };
    const horizonEnd = new Date(Date.now() + horizon * 864e5).toISOString();
    const { data: dated, error: dErr, count: datedCount } = await base().not("deadline", "is", null).lte("deadline", horizonEnd).order("deadline", { ascending: true }).limit(200);
    if (dErr) return fail(dErr.message);
    const { count: undatedCount } = await base().is("deadline", null).limit(1);
    const { data: undatedSample } = await base().is("deadline", null).order("created_at", { ascending: true }).limit(LIST);
    const rows = dated ?? [];
    const names = await resolveNames(supabase, [...rows, ...undatedSample ?? []]);
    const decorate = (t) => ({
      id: t.id,
      title: t.title,
      deadline: t.deadline,
      project_name: t.group_id ? names.project.get(t.group_id) ?? null : null,
      assignee_name: t.assigned_to ? names.person.get(t.assigned_to) ?? null : null
    });
    const buckets = bucketByUrgency(rows.map(decorate), horizon);
    let msGroupIds = groupIds;
    if (!msGroupIds) {
      const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", uid);
      msGroupIds = [...new Set((mine ?? []).map((m) => m.group_id))];
    }
    let milestones = [];
    if (msGroupIds.length) {
      const { data } = await supabase.from("project_milestones").select("id,name,planned_date,actual_date,group_id").in("group_id", msGroupIds).is("actual_date", null).lte("planned_date", horizonEnd).order("planned_date", { ascending: true }).limit(100);
      milestones = data ?? [];
    }
    const msNames = /* @__PURE__ */ new Map();
    if (milestones.length) {
      const { data: groups } = await supabase.from("task_groups").select("id,name").in("id", [...new Set(milestones.map((m) => m.group_id))]);
      for (const g of groups ?? []) msNames.set(g.id, g.name);
    }
    const risky = milestonesAtRisk(
      milestones.map((m) => ({ ...m, project_name: msNames.get(m.group_id) ?? null })),
      horizon
    );
    const drifted = rows.map((t) => ({ ...decorate(t), drift_days: driftDays(t.original_deadline, t.deadline) })).filter((t) => t.drift_days !== null && t.drift_days !== 0).sort((a, b) => Math.abs(b.drift_days) - Math.abs(a.drift_days)).slice(0, LIST);
    const short = (list) => list.slice(0, LIST);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            about: scope === "created_by_me" ? "\u0437\u0430\u0434\u0430\u0447\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u0432\u044B \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u043B\u0438" : `\u0437\u0430\u0434\u0430\u0447\u0438 ${who.name}`,
            horizon_days: horizon,
            scope: input.project_id ? { project_id: input.project_id } : "\u0432\u0441\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u044B",
            overdue: { count: buckets.overdue.length, items: short(buckets.overdue) },
            today: { count: buckets.today.length, items: short(buckets.today) },
            soon: { count: buckets.soon.length, items: short(buckets.soon) },
            later_than_horizon: buckets.later,
            no_deadline: { count: undatedCount ?? 0, items: (undatedSample ?? []).map(decorate) },
            milestones_at_risk: {
              missed: risky.filter((m) => m.missed).length,
              upcoming: risky.filter((m) => !m.missed).length,
              items: short(risky)
            },
            drifted_most: drifted,
            // Честно про полноту: сводка, которая молчит об усечении, хуже
            // отсутствующей — по ней делают вывод «всё под контролем».
            complete: (datedCount ?? rows.length) <= rows.length,
            ...(datedCount ?? 0) > rows.length ? { note: `\u0417\u0430\u0434\u0430\u0447 \u0441\u043E \u0441\u0440\u043E\u043A\u043E\u043C \u0432 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0435 ${datedCount}, \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043D\u043E ${rows.length}. \u0421\u0443\u0437\u044C\u0442\u0435 \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442 \u0438\u043B\u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u043E\u0435\u043A\u0442.` } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/create_protocol.ts
import { defineTool as defineTool26 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z26 } from "npm:zod@^4.4.3";
var MAX_ITEMS3 = 60;
var create_protocol_default = defineTool26({
  name: "create_protocol",
  title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441\u043E\u0432\u0435\u0449\u0430\u043D\u0438\u044F",
  description: "\u041E\u0444\u043E\u0440\u043C\u043B\u044F\u0435\u0442 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441\u043E\u0432\u0435\u0449\u0430\u043D\u0438\u044F \u0441 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F\u043C\u0438: \xAB\u0432\u043E\u0442 \u0437\u0430\u043F\u0438\u0441\u044C \u0432\u0441\u0442\u0440\u0435\u0447\u0438, \u0441\u0434\u0435\u043B\u0430\u0439 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\xBB. \u0421\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0427\u0415\u0420\u041D\u041E\u0412\u0418\u041A\u041E\u041C \u2014 \u043E\u043D \u043D\u0435 \u0432\u0438\u0434\u0435\u043D \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C \u0438 \u043D\u0438\u043A\u043E\u0433\u043E \u043D\u0435 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u044F\u0435\u0442, \u043F\u043E\u043A\u0430 \u0435\u0433\u043E \u043D\u0435 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u0443\u044E\u0442 \u0447\u0435\u0440\u0435\u0437 publish_protocol. \u0422\u0430\u043A \u0436\u0435 \u0432\u0435\u0434\u0451\u0442 \u0441\u0435\u0431\u044F \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435. attendees \u2014 \u0441\u0432\u043E\u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 (id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F), external_attendees \u2014 \u0433\u043E\u0441\u0442\u0438 \u0441\u0442\u0440\u043E\u043A\u0430\u043C\u0438. action_items \u2014 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F: \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435, \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C, \u0441\u0440\u043E\u043A. client_id \u0441\u0432\u044F\u0437\u044B\u0432\u0430\u0435\u0442 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C CRM, context_project_id \u2014 \u0441 \u043F\u0440\u043E\u0435\u043A\u0442\u043E\u043C, \u0432 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0435 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0448\u043B\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0430.",
  inputSchema: {
    title: z26.string().min(1).max(300).describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430."),
    meeting_date: z26.string().describe("\u0414\u0430\u0442\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0438, ISO (\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0413\u0413\u0413\u0413-\u041C\u041C-\u0414\u0414)."),
    format: z26.enum(["offline", "online"]).optional().describe("\u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E offline."),
    description: z26.string().max(5e3).optional().describe("\u0418\u0442\u043E\u0433\u0438, \u0440\u0435\u0448\u0435\u043D\u0438\u044F, \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043F\u043E \u0432\u0441\u0442\u0440\u0435\u0447\u0435."),
    client_id: z26.string().uuid().optional().describe("\u041A\u043B\u0438\u0435\u043D\u0442 CRM, \u0435\u0441\u043B\u0438 \u0432\u0441\u0442\u0440\u0435\u0447\u0430 \u0441 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u043C."),
    context_project_id: z26.string().uuid().optional().describe("\u041F\u0440\u043E\u0435\u043A\u0442, \u0432 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0435 \u043A\u043E\u0442\u043E\u0440\u043E\u0433\u043E \u0448\u043B\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0430."),
    attendees: z26.array(z26.string()).max(50).optional().describe("\u0421\u0432\u043E\u0438 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F."),
    external_attendees: z26.array(z26.string().max(200)).max(50).optional().describe("\u0412\u043D\u0435\u0448\u043D\u0438\u0435 \u0433\u043E\u0441\u0442\u0438 \u0441\u0442\u0440\u043E\u043A\u0430\u043C\u0438."),
    action_items: z26.array(
      z26.object({
        title: z26.string().min(1).max(500),
        assignee: z26.string().optional().describe("id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F; \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u2014 \u0432\u044B."),
        deadline: z26.string().optional().describe("ISO datetime."),
        description: z26.string().max(2e3).optional()
      })
    ).max(MAX_ITEMS3).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const meeting = new Date(input.meeting_date);
    if (Number.isNaN(meeting.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0434\u0430\u0442\u0443 \u0432\u0441\u0442\u0440\u0435\u0447\u0438 \xAB${input.meeting_date}\xBB.`);
    const year = meeting.getUTCFullYear();
    if (year < 2e3 || year > 2100) return fail(`\u0414\u0430\u0442\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0438 ${input.meeting_date} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430.`);
    const meetingDate = meeting.toISOString().slice(0, 10);
    const problems = [];
    const people = /* @__PURE__ */ new Map();
    for (const who of [...input.attendees ?? [], ...(input.action_items ?? []).map((i) => i.assignee)]) {
      if (!who || people.has(who)) continue;
      const r = await resolveUser(supabase, who);
      if ("error" in r) problems.push(r.error);
      else people.set(who, r);
    }
    const items = (input.action_items ?? []).map((i) => ({ ...i }));
    for (const it of items) {
      if (it.deadline === void 0) continue;
      const d = new Date(it.deadline);
      if (Number.isNaN(d.getTime())) {
        problems.push(`\u041F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \xAB${it.title}\xBB: \u043D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B \u0441\u0440\u043E\u043A \xAB${it.deadline}\xBB.`);
        continue;
      }
      const y = d.getUTCFullYear();
      if (y < 2e3 || y > 2100) problems.push(`\u041F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \xAB${it.title}\xBB: \u0441\u0440\u043E\u043A ${it.deadline} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430.`);
      else it.deadline = d.toISOString();
    }
    if (input.client_id) {
      const { data: client } = await supabase.from("clients").select("id").eq("id", input.client_id).maybeSingle();
      if (!client) problems.push("\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    }
    if (input.context_project_id) {
      const { data: project } = await supabase.from("task_groups").select("id").eq("id", input.context_project_id).maybeSingle();
      if (!project) problems.push("\u041F\u0440\u043E\u0435\u043A\u0442 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    }
    if (problems.length) {
      return fail(`\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D, ${problems.length === 1 ? "\u043C\u0435\u0448\u0430\u0435\u0442" : "\u043C\u0435\u0448\u0430\u044E\u0442"}:
\u2014 ${problems.join("\n\u2014 ")}`);
    }
    const internal = [.../* @__PURE__ */ new Set([uid, ...(input.attendees ?? []).map((a) => people.get(a).id)])];
    const { data: protocol, error } = await supabase.from("task_groups").insert({
      name: input.title.trim(),
      user_id: uid,
      icon: "\u{1F4CB}",
      color: "#6366f1",
      project_type: "protocol",
      // Всегда черновик — как в приложении.
      draft_status: "draft",
      description: input.description ?? null,
      client_id: input.client_id ?? null,
      protocol_meta: {
        meeting_date: meetingDate,
        format: input.format ?? "offline",
        internal_attendees: internal,
        external_attendees: input.external_attendees ?? [],
        template_system_key: null,
        ...input.context_project_id ? { context_project_id: input.context_project_id } : {},
        // Видно, что протокол собран из разговора, а не набран руками.
        created_via: "mcp"
      }
    }).select("id,name").single();
    if (error) return fail(error.message);
    const warnings = [];
    const { error: mErr } = await supabase.from("group_members").insert(internal.map((user_id) => ({ group_id: protocol.id, user_id, invited_by: uid, role: user_id === uid ? "owner" : "member" })));
    if (mErr) warnings.push(`\u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u044B: ${mErr.message}`);
    const created = [];
    for (const it of items) {
      const assignee = it.assignee ? people.get(it.assignee) : { id: uid, name: "\u0432\u044B" };
      const r = await insertTask(supabase, uid, {
        title: it.title,
        description: it.description ?? null,
        deadline: it.deadline ?? null,
        group_id: protocol.id,
        assigned_to: assignee.id,
        // Поля протокола — те же, что ставит приложение поручению внутри
        // протокола (ProtocolInternalSection).
        is_draft: true,
        source_protocol_id: protocol.id,
        protocol_scope: "internal",
        status_meta: { created_by: "claude", created_via: "mcp", source: { kind: "meeting" } }
      });
      if ("error" in r) {
        warnings.push(`\u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0435 \xAB${it.title}\xBB \u043D\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u043E: ${r.error}`);
        continue;
      }
      warnings.push(...r.warnings);
      created.push({ id: r.task.id, title: it.title, assignee: assignee.name, deadline: it.deadline ?? null });
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            created: true,
            protocol: { id: protocol.id, name: protocol.name, status: "draft", meeting_date: meetingDate },
            attendees: internal.length,
            external_attendees: (input.external_attendees ?? []).length,
            action_items: created,
            next_step: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441\u043E\u0437\u0434\u0430\u043D \u0427\u0415\u0420\u041D\u041E\u0412\u0418\u041A\u041E\u041C: \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 \u0435\u0433\u043E \u043D\u0435 \u0432\u0438\u0434\u044F\u0442 \u0438 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0438. \u041F\u043E\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443, \u0430 \u043F\u043E\u0441\u043B\u0435 \u0441\u0432\u0435\u0440\u043A\u0438 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0439\u0442\u0435 \u0447\u0435\u0440\u0435\u0437 publish_protocol \u2014 \u0442\u043E\u0433\u0434\u0430 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u0441\u0442\u0430\u043D\u0443\u0442 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0438\u043C\u0438.",
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/publish_protocol.ts
import { defineTool as defineTool27 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z27 } from "npm:zod@^4.4.3";
var publish_protocol_default = defineTool27({
  name: "publish_protocol",
  title: "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B",
  description: "\u041F\u0443\u0431\u043B\u0438\u043A\u0443\u0435\u0442 \u0447\u0435\u0440\u043D\u043E\u0432\u0438\u043A \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430: \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u0441\u0442\u0430\u043D\u043E\u0432\u044F\u0442\u0441\u044F \u0432\u0438\u0434\u043D\u044B \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F\u043C, \u0438 \u043E\u043D\u0438 \u043F\u043E\u043B\u0443\u0447\u0430\u044E\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435. \u041C\u044F\u0433\u043A\u0438\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \xAB\u0438\u0437\u0443\u0447\u0438\u0442\u044C, \u0434\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\xBB \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u044E\u0442\u0441\u044F \u0441 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u043C \xAB\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043E\xBB. \u041F\u041E \u0423\u041C\u041E\u041B\u0427\u0410\u041D\u0418\u042E \u041D\u0418\u0427\u0415\u0413\u041E \u041D\u0415 \u041F\u0418\u0428\u0415\u0422: \u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u044F\u0435\u0442 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u0439, \u043A\u043E\u0442\u043E\u0440\u044B\u043C \u043E\u043D\u0438 \u0441\u0442\u0430\u043D\u0443\u0442 \u0432\u0438\u0434\u043D\u044B; \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438 apply=true \u2014 \u043E\u0442\u043E\u0437\u0432\u0430\u0442\u044C \u0435\u0451 \u043D\u0435\u043B\u044C\u0437\u044F, \u043B\u044E\u0434\u0438 \u0443\u0436\u0435 \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u044E\u0442.",
  inputSchema: {
    protocol_id: z27.string().uuid().describe("UUID \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430 (task_groups.id \u0441 project_type=protocol)."),
    apply: z27.boolean().optional().describe("true \u2014 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E false: \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C.")
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const { data: protocol, error } = await supabase.from("task_groups").select("id,name,project_type,draft_status").eq("id", input.protocol_id).maybeSingle();
    if (error) return fail(error.message);
    if (!protocol) return fail("\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D");
    if (protocol.project_type !== "protocol") {
      return fail(`\xAB${protocol.name}\xBB \u2014 \u044D\u0442\u043E \u043F\u0440\u043E\u0435\u043A\u0442, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B. \u041F\u0443\u0431\u043B\u0438\u043A\u0443\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B.`);
    }
    if (protocol.draft_status === "published") return fail(`\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \xAB${protocol.name}\xBB \u0443\u0436\u0435 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D`);
    const { data: drafts, error: dErr } = await supabase.from("tasks").select("id,title,assigned_to,deadline").eq("group_id", protocol.id).eq("is_draft", true);
    if (dErr) return fail(dErr.message);
    const rows = drafts ?? [];
    const ids = [...new Set(rows.map((t) => t.assigned_to).filter((v) => !!v))];
    const names = /* @__PURE__ */ new Map();
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name ?? p.email ?? p.id);
    }
    const willAppear = rows.map((t) => ({
      title: t.title,
      assignee: t.assigned_to ? names.get(t.assigned_to) ?? t.assigned_to : null,
      deadline: t.deadline
    }));
    const withoutAssignee = willAppear.filter((t) => !t.assignee).length;
    const withoutDeadline = willAppear.filter((t) => !t.deadline).length;
    if (!input.apply) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              published: false,
              protocol: { id: protocol.id, name: protocol.name },
              will_become_visible: willAppear,
              count: willAppear.length,
              // Это то, что стоит поправить ДО публикации, а не после: потом
              // поручение уже прочитали и переспрашивать неудобно.
              check_first: {
                without_assignee: withoutAssignee,
                without_deadline: withoutDeadline,
                hint: withoutAssignee || withoutDeadline ? "\u041F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u0431\u0435\u0437 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F \u0438\u043B\u0438 \u0431\u0435\u0437 \u0441\u0440\u043E\u043A\u0430 \u043E\u0431\u044B\u0447\u043D\u043E \u0437\u043D\u0430\u0447\u0430\u0442, \u0447\u0442\u043E \u043D\u0430 \u0432\u0441\u0442\u0440\u0435\u0447\u0435 \u044D\u0442\u043E \u043D\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438. \u041B\u0443\u0447\u0448\u0435 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u044C \u0434\u043E \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438." : "\u0423 \u0432\u0441\u0435\u0445 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0439 \u0435\u0441\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u0438 \u0441\u0440\u043E\u043A."
              },
              warning: "\u041F\u043E\u0441\u043B\u0435 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u0438 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 \u0443\u0432\u0438\u0434\u044F\u0442 \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u0438 \u043F\u043E\u043B\u0443\u0447\u0430\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435. \u041E\u0442\u043E\u0437\u0432\u0430\u0442\u044C \u044D\u0442\u043E \u043D\u0435\u043B\u044C\u0437\u044F.",
              apply_with: "\u0442\u043E\u0442 \u0436\u0435 \u0432\u044B\u0437\u043E\u0432 \u0441 apply=true"
            })
          }
        ]
      };
    }
    if (rows.length) {
      const { error: tErr } = await supabase.from("tasks").update({ is_draft: false }).eq("group_id", protocol.id).eq("is_draft", true);
      if (tErr) return fail(`\u041F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u043D\u0435 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u044B: ${tErr.message}`);
    }
    const { data: updated, error: gErr } = await supabase.from("task_groups").update({ draft_status: "published" }).eq("id", protocol.id).select("id");
    if (gErr) return fail(`\u041F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u044F \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u044B, \u043D\u043E \u0441\u0442\u0430\u0442\u0443\u0441 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430 \u043D\u0435 \u0438\u0437\u043C\u0435\u043D\u0451\u043D: ${gErr.message}`);
    if (!updated?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044E \u044D\u0442\u043E\u0433\u043E \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u0430");
    const warnings = [];
    const { error: rErr } = await supabase.from("tasks").update({ is_completed: true, completed_at: (/* @__PURE__ */ new Date()).toISOString(), closure_result: "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043E" }).eq("source_protocol_id", protocol.id).eq("task_type", "protocol_review").eq("is_completed", false);
    if (rErr) warnings.push(`\u0437\u0430\u0434\u0430\u0447\u0438 \xAB\u0438\u0437\u0443\u0447\u0438\u0442\u044C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\xBB \u043D\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u044B: ${rErr.message}`);
    for (const person of ids) {
      if (person === uid) continue;
      const mine = willAppear.filter((t) => t.assignee === (names.get(person) ?? person));
      await notify(
        supabase,
        "new_task_in_group",
        `${protocol.name}: \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0439 ${mine.length}`,
        [person],
        null
      );
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            published: true,
            protocol: { id: protocol.id, name: protocol.name, status: "published" },
            tasks_published: rows.length,
            notified: ids.filter((p) => p !== uid).length,
            ...warnings.length ? { warnings } : {}
          })
        }
      ]
    };
  }
});

// src/lib/mcp/tools/list_protocols.ts
import process7 from "node:process";
import { createClient as createClient7 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool28 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z28 } from "npm:zod@^4.4.3";
function db7(ctx) {
  return createClient7(process7.env.SUPABASE_URL, process7.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var list_protocols_default = defineTool28({
  name: "list_protocols",
  title: "\u0421\u043F\u0438\u0441\u043E\u043A \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u043E\u0432 \u0432\u0441\u0442\u0440\u0435\u0447",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B (task_groups \u0441 project_type='protocol'). \u0424\u0438\u043B\u044C\u0442\u0440\u044B: \u043A\u043B\u0438\u0435\u043D\u0442, \u0441\u0442\u0430\u0442\u0443\u0441 (draft/published), \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D \u0434\u0430\u0442. \u0412 \u043E\u0442\u0432\u0435\u0442\u0435 \u0435\u0441\u0442\u044C total \u0438 has_more: \u0435\u0441\u043B\u0438 has_more=true, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435 \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u2014 \u043D\u0435 \u0441\u0443\u0434\u0438\u0442\u0435 \u043E \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435 \u043F\u043E \u0434\u043B\u0438\u043D\u0435 \u0441\u043F\u0438\u0441\u043A\u0430.",
  inputSchema: {
    client_id: z28.string().uuid().optional(),
    status: z28.enum(["draft", "published"]).optional(),
    date_from: z28.string().optional().describe("ISO date, \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E"),
    date_to: z28.string().optional().describe("ISO date, \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E"),
    limit: z28.number().int().min(1).max(100).optional(),
    offset: z28.number().int().min(0).optional().describe("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u0414\u043B\u044F \u043F\u043E\u0441\u0442\u0440\u0430\u043D\u0438\u0447\u043D\u043E\u0433\u043E \u043E\u0431\u0445\u043E\u0434\u0430, \u043A\u043E\u0433\u0434\u0430 has_more=true.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db7(ctx);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = supabase.from("task_groups").select("id,name,description,client_id,created_at,status:draft_status,meeting_date:protocol_meta->>meeting_date", { count: "exact" }).eq("project_type", "protocol").order("protocol_meta->>meeting_date", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
    if (input.client_id) q = q.eq("client_id", input.client_id);
    if (input.status) q = q.eq("draft_status", input.status);
    if (input.date_from) q = q.gte("protocol_meta->>meeting_date", input.date_from.slice(0, 10));
    if (input.date_to) q = q.lte("protocol_meta->>meeting_date", input.date_to.slice(0, 10));
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = data ?? [];
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return {
      content: [{ type: "text", text: hasMore ? `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u043E\u0432 \u0438\u0437 ${total} (\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${offset}). \u042D\u0442\u043E \u041D\u0415 \u0432\u0441\u0435: \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0441 offset=${offset + rows.length} \u0438\u043B\u0438 \u0441\u0443\u0437\u044C\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440.` : `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u043E\u0432 \u0438\u0437 ${total} \u2014 \u044D\u0442\u043E \u0432\u0441\u0435, \u0447\u0442\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440.` }],
      structuredContent: { protocols: rows, total, returned: rows.length, offset, has_more: hasMore }
    };
  }
});

// src/lib/mcp/tools/get_protocol.ts
import process8 from "node:process";
import { createClient as createClient8 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool29 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z29 } from "npm:zod@^4.4.3";
function db8(ctx) {
  return createClient8(process8.env.SUPABASE_URL, process8.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var get_protocol_default = defineTool29({
  name: "get_protocol",
  title: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u2014 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0438 \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B, \u0437\u0430\u0434\u0430\u0447\u0438 \u043F\u043E\u0432\u0435\u0441\u0442\u043A\u0438 \u0438 \u0437\u0430\u0434\u0430\u0447\u0438, \u043F\u043E\u0440\u043E\u0436\u0434\u0451\u043D\u043D\u044B\u0435 \u0438\u0437 \u0432\u0441\u0442\u0440\u0435\u0447\u0438 (source_protocol_id).",
  inputSchema: { protocol_id: z29.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ protocol_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db8(ctx);
    const [{ data: protocol, error }, { data: agenda }, { data: followups }] = await Promise.all([
      supabase.from("task_groups").select("*").eq("id", protocol_id).eq("project_type", "protocol").maybeSingle(),
      supabase.from("tasks").select("id,title,description,is_completed,deadline,assigned_to").eq("group_id", protocol_id).order("position"),
      supabase.from("tasks").select("id,title,is_completed,deadline,group_id,assigned_to").eq("source_protocol_id", protocol_id).limit(200)
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!protocol) return { content: [{ type: "text", text: "\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" }], isError: true };
    return {
      content: [{ type: "text", text: `\u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \xAB${protocol.name}\xBB` }],
      structuredContent: { protocol, agenda: agenda ?? [], followup_tasks: followups ?? [] }
    };
  }
});

// src/lib/mcp/tools/list_clients.ts
import process9 from "node:process";
import { createClient as createClient9 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool30 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z30 } from "npm:zod@^4.4.3";
function db9(ctx) {
  return createClient9(process9.env.SUPABASE_URL, process9.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var list_clients_default = defineTool30({
  name: "list_clients",
  title: "\u0421\u043F\u0438\u0441\u043E\u043A CRM-\u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 CRM-\u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432. \u041C\u043E\u0436\u043D\u043E \u0438\u0441\u043A\u0430\u0442\u044C \u043F\u043E \u0438\u043C\u0435\u043D\u0438 \u0438 \u0444\u0438\u043B\u044C\u0442\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u043E \u0442\u0435\u0440\u0440\u0438\u0442\u043E\u0440\u0438\u0438/\u0440\u0430\u043D\u0433\u0443/\u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443. \u0412 \u043E\u0442\u0432\u0435\u0442\u0435 \u0435\u0441\u0442\u044C total \u0438 has_more: \u0435\u0441\u043B\u0438 has_more=true, \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u044B \u043D\u0435 \u0432\u0441\u0435 \u0437\u0430\u043F\u0438\u0441\u0438 \u2014 \u043D\u0435 \u0441\u0443\u0434\u0438\u0442\u0435 \u043E \u043A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u0435 \u043F\u043E \u0434\u043B\u0438\u043D\u0435 \u0441\u043F\u0438\u0441\u043A\u0430.",
  inputSchema: {
    search: z30.string().optional().describe("\u041F\u043E\u0434\u0441\u0442\u0440\u043E\u043A\u0430 \u0432 \u0438\u043C\u0435\u043D\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u0430"),
    territory: z30.string().optional().describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u0435\u0440\u0440\u0438\u0442\u043E\u0440\u0438\u0438 (\u0442\u0435\u0433), \u0431\u0435\u0437 \u0443\u0447\u0451\u0442\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430"),
    rank: z30.string().optional().describe("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0440\u0430\u043D\u0433\u0430 (\u0442\u0435\u0433), \u0431\u0435\u0437 \u0443\u0447\u0451\u0442\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430"),
    manager_id: z30.string().uuid().optional(),
    limit: z30.number().int().min(1).max(200).optional(),
    offset: z30.number().int().min(0).optional().describe("\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u043F\u0440\u043E\u043F\u0443\u0441\u0442\u0438\u0442\u044C. \u0414\u043B\u044F \u043F\u043E\u0441\u0442\u0440\u0430\u043D\u0438\u0447\u043D\u043E\u0433\u043E \u043E\u0431\u0445\u043E\u0434\u0430, \u043A\u043E\u0433\u0434\u0430 has_more=true.")
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db9(ctx);
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    const tagIds = async (name) => {
      const { data: data2 } = await supabase.from("tags").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&"));
      return (data2 ?? []).map((t) => t.id);
    };
    let q = supabase.from("clients").select(
      "id,name,city,manager_id,logo_url,territory:tags!clients_territory_tag_id_fkey(name),rank:tags!clients_rank_tag_id_fkey(name),retail_type:tags!clients_retail_type_tag_id_fkey(name)",
      { count: "exact" }
    ).order("name").range(offset, offset + limit - 1);
    if (input.search) q = q.ilike("name", `%${input.search}%`);
    if (input.territory) q = q.in("territory_tag_id", await tagIds(input.territory));
    if (input.rank) q = q.in("rank_tag_id", await tagIds(input.rank));
    if (input.manager_id) q = q.eq("manager_id", input.manager_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map((c) => ({
      ...c,
      territory: c.territory?.name ?? null,
      rank: c.rank?.name ?? null,
      retail_type: c.retail_type?.name ?? null
    }));
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return {
      content: [{ type: "text", text: hasMore ? `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u0438\u0437 ${total} (\u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E ${offset}). \u042D\u0442\u043E \u041D\u0415 \u0432\u0441\u0435: \u043F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u0441 offset=${offset + rows.length} \u0438\u043B\u0438 \u0441\u0443\u0437\u044C\u0442\u0435 \u0444\u0438\u043B\u044C\u0442\u0440.` : `\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E ${rows.length} \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 \u0438\u0437 ${total} \u2014 \u044D\u0442\u043E \u0432\u0441\u0435, \u0447\u0442\u043E \u043F\u043E\u0434\u0445\u043E\u0434\u044F\u0442 \u043F\u043E\u0434 \u0444\u0438\u043B\u044C\u0442\u0440.` }],
      structuredContent: { clients: rows, total, returned: rows.length, offset, has_more: hasMore }
    };
  }
});

// src/lib/mcp/tools/get_client.ts
import process10 from "node:process";
import { createClient as createClient10 } from "npm:@supabase/supabase-js@^2.95.3";
import { defineTool as defineTool31 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z31 } from "npm:zod@^4.4.3";
function db10(ctx) {
  return createClient10(process10.env.SUPABASE_URL, process10.env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
var get_client_default = defineTool31({
  name: "get_client",
  title: "\u041A\u043B\u0438\u0435\u043D\u0442 \u2014 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442\u044C",
  description: "\u0412\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 CRM-\u043A\u043B\u0438\u0435\u043D\u0442\u0430, \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0435 \u043E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0437\u0430\u0434\u0430\u0447\u0438, \u043F\u0440\u043E\u0435\u043A\u0442\u044B \u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B \u0437\u0430 90 \u0434\u043D\u0435\u0439.",
  inputSchema: { client_id: z31.string().uuid() },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" }], isError: true };
    const supabase = db10(ctx);
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1e3).toISOString().slice(0, 10);
    const [{ data: client, error }, { data: tasks }, { data: projects }, { data: protocols }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", client_id).maybeSingle(),
      supabase.from("tasks").select("id,title,deadline,is_completed,group_id").eq("client_id", client_id).eq("is_completed", false).limit(100),
      supabase.from("task_groups").select("id,name,project_type").eq("client_id", client_id).neq("project_type", "protocol").limit(50),
      // Дата встречи — protocol_meta.meeting_date, статус — draft_status (колонок protocol_* нет).
      supabase.from("task_groups").select("id,name,status:draft_status,meeting_date:protocol_meta->>meeting_date").eq("client_id", client_id).eq("project_type", "protocol").gte("protocol_meta->>meeting_date", since).order("protocol_meta->>meeting_date", { ascending: false }).limit(50)
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!client) return { content: [{ type: "text", text: "\u041A\u043B\u0438\u0435\u043D\u0442 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D" }], isError: true };
    return {
      content: [{ type: "text", text: `${client.name}: \u043E\u0442\u043A\u0440. \u0437\u0430\u0434\u0430\u0447 ${tasks?.length ?? 0}, \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u043E\u0432 \u0437\u0430 90 \u0434\u043D ${protocols?.length ?? 0}` }],
      structuredContent: { client, open_tasks: tasks ?? [], projects: projects ?? [], recent_protocols: protocols ?? [] }
    };
  }
});

// src/lib/mcp/tools/update_task.ts
import { defineTool as defineTool32 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z32 } from "npm:zod@^4.4.3";
var update_task_default = defineTool32({
  name: "update_task",
  title: "\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0443",
  description: "\u041C\u0435\u043D\u044F\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0443: \u0441\u0442\u0430\u0442\u0443\u0441, \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044F, \u0441\u0440\u043E\u043A, \u0432\u0430\u0436\u043D\u043E\u0441\u0442\u044C, \u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442. \u041F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439 \u0442\u043E\u043B\u044C\u043A\u043E \u0442\u043E, \u0447\u0442\u043E \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F. status \u2014 \u0442\u0435 \u0436\u0435 \u0441\u0442\u0430\u0442\u0443\u0441\u044B, \u0447\u0442\u043E \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438: \xAB\u0432 \u0440\u0430\u0431\u043E\u0442\u0435\xBB, \xAB\u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E\xBB, \xAB\u0436\u0434\u0451\u043C \u043E\u0442\u0432\u0435\u0442\xBB, \xAB\u043F\u043E\u043B\u0443\u0447\u0435\u043D \u043E\u0442\u0432\u0435\u0442\xBB, \xAB\u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E\xBB, \xAB\u043E\u0442\u043C\u0435\u043D\u0435\u043D\u043E\xBB; \xABnone\xBB \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u0441\u0442\u0430\u0442\u0443\u0441. \u0421\u0442\u0430\u0442\u0443\u0441 \u2014 \u044D\u0442\u043E \u043F\u043E\u043C\u0435\u0442\u043A\u0430 \u0445\u043E\u0434\u0430 \u0440\u0430\u0431\u043E\u0442\u044B, \u043E\u043D \u041D\u0415 \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0435\u0442 \u0437\u0430\u0434\u0430\u0447\u0443: \u0434\u043B\u044F \u0437\u0430\u043A\u0440\u044B\u0442\u0438\u044F \u2014 complete_task. assignee \u2014 id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F; \u043D\u043E\u0432\u044B\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435. deadline: null \u0441\u043D\u0438\u043C\u0430\u0435\u0442 \u0441\u0440\u043E\u043A. start_at \u2014 \u0434\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430: \u0441 \u043D\u0435\u0439 \u0437\u0430\u0434\u0430\u0447\u0430 \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u043E\u0442\u0440\u0435\u0437\u043A\u043E\u043C \u043D\u0430 \u0413\u0430\u043D\u0442\u0435, \u0430 \u043D\u0435 \u0442\u043E\u0447\u043A\u043E\u0439; \u0434\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C \u043D\u0438\u0433\u0434\u0435 \u043D\u0435 \u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F, \u043E\u043D\u0430 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u0438\u0437 \u043D\u0430\u0447\u0430\u043B\u0430 \u0438 \u0441\u0440\u043E\u043A\u0430. \u0412\u043D\u0438\u043C\u0430\u043D\u0438\u0435: \u0437\u0434\u0435\u0441\u044C \u0441\u0440\u043E\u043A \u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F \u0411\u0415\u0417 \u043F\u0435\u0440\u0435\u0441\u0447\u0451\u0442\u0430 \u0441\u0432\u044F\u0437\u0430\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447 \u2014 \u044D\u0442\u043E \u043F\u0440\u0430\u0432\u043A\u0430 \u0437\u0430\u0434\u0430\u0447\u0438, \u043A\u0430\u043A \u0432 \u0435\u0451 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0435. \u0427\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0442\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u0432\u043C\u0435\u0441\u0442\u0435 \u0441\u043E \u0432\u0441\u0435\u043C, \u0447\u0442\u043E \u0437\u0430 \u043D\u0435\u0439 \u0441\u0442\u043E\u0438\u0442, \u0435\u0441\u0442\u044C move_task (\u0438 preview_shift, \u0447\u0442\u043E\u0431\u044B \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C).",
  inputSchema: {
    task_id: z32.string().uuid(),
    status: z32.enum([...STATUS_NAMES, "none"]).optional(),
    assignee: z32.string().optional().describe("\u041D\u043E\u0432\u044B\u0439 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C: id, \u043F\u043E\u0447\u0442\u0430 \u0438\u043B\u0438 \u0438\u043C\u044F"),
    deadline: z32.string().nullable().optional().describe("ISO datetime; null \u2014 \u0441\u043D\u044F\u0442\u044C \u0441\u0440\u043E\u043A"),
    start_at: z32.string().nullable().optional().describe("\u0414\u0430\u0442\u0430 \u043D\u0430\u0447\u0430\u043B\u0430, ISO datetime; null \u2014 \u0441\u043D\u044F\u0442\u044C \u043D\u0430\u0447\u0430\u043B\u043E"),
    is_important: z32.boolean().optional(),
    priority: z32.number().int().min(1).max(4).nullable().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const { data: task, error: rErr } = await supabase.from("tasks").select("id,title,assigned_to,is_completed,group_id").eq("id", input.task_id).maybeSingle();
    if (rErr) return fail(rErr.message);
    if (!task) return fail("\u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
    const updates = {};
    let newAssignee = null;
    if (input.assignee !== void 0) {
      const r = await resolveUser(supabase, input.assignee);
      if ("error" in r) return fail(r.error);
      newAssignee = r;
      updates.assigned_to = r.id;
    }
    for (const field of ["deadline", "start_at"]) {
      const raw = input[field];
      if (raw === void 0) continue;
      if (raw === null) {
        updates[field] = null;
        continue;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return fail(`\u041D\u0435 \u0440\u0430\u0437\u043E\u0431\u0440\u0430\u043B ${field}: \xAB${raw}\xBB. \u041D\u0443\u0436\u0435\u043D ISO datetime.`);
      const y = d.getUTCFullYear();
      if (y < 2e3 || y > 2100) return fail(`\u0414\u0430\u0442\u0430 ${raw} \u0432\u043D\u0435 \u0440\u0430\u0437\u0443\u043C\u043D\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 (2000\u20132100).`);
      updates[field] = d.toISOString();
    }
    const finalStart = "start_at" in updates ? updates.start_at : void 0;
    const finalDeadline = "deadline" in updates ? updates.deadline : void 0;
    if (finalStart || finalDeadline) {
      const { data: cur } = await supabase.from("tasks").select("start_at,deadline").eq("id", input.task_id).maybeSingle();
      const start = finalStart !== void 0 ? finalStart : cur?.start_at ?? null;
      const end = finalDeadline !== void 0 ? finalDeadline : cur?.deadline ?? null;
      if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
        return fail(`\u041D\u0430\u0447\u0430\u043B\u043E (${start}) \u043F\u043E\u0437\u0436\u0435 \u0441\u0440\u043E\u043A\u0430 (${end}) \u2014 \u0442\u0430\u043A \u0437\u0430\u0434\u0430\u0447\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u043E\u0439 \u0434\u043B\u0438\u043D\u044B.`);
      }
    }
    if (input.is_important !== void 0) updates.is_important = input.is_important;
    if (input.priority !== void 0) updates.priority = input.priority;
    if (updates.deadline && await isPlanningPhase(supabase, task.group_id)) {
      updates.original_deadline = updates.deadline;
    }
    const changed = [];
    if (Object.keys(updates).length) {
      const { data: upd, error } = await supabase.from("tasks").update(updates).eq("id", task.id).select("id");
      if (error) return fail(error.message);
      if (!upd?.length) return fail("\u041D\u0435\u0442 \u043F\u0440\u0430\u0432 \u043D\u0430 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438");
      if (newAssignee) changed.push(`\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C \u2192 ${newAssignee.name}`);
      if ("deadline" in updates) changed.push(updates.deadline ? `\u0441\u0440\u043E\u043A \u2192 ${updates.deadline}` : "\u0441\u0440\u043E\u043A \u0441\u043D\u044F\u0442");
      if ("start_at" in updates) changed.push(updates.start_at ? `\u043D\u0430\u0447\u0430\u043B\u043E \u2192 ${updates.start_at}` : "\u043D\u0430\u0447\u0430\u043B\u043E \u0441\u043D\u044F\u0442\u043E");
      if ("is_important" in updates) changed.push(updates.is_important ? "\u0432\u0430\u0436\u043D\u0430\u044F" : "\u043D\u0435 \u0432\u0430\u0436\u043D\u0430\u044F");
      if ("priority" in updates) changed.push(`\u043F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442 \u2192 ${updates.priority ?? "\u043D\u0435\u0442"}`);
    }
    if (input.status) {
      const r = await setStatus(supabase, uid, task.id, input.status);
      if ("error" in r) return fail(`${changed.length ? `\u0418\u0437\u043C\u0435\u043D\u0435\u043D\u043E: ${changed.join(", ")}. ` : ""}\u0421\u0442\u0430\u0442\u0443\u0441 \u043D\u0435 \u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D: ${r.error}`);
      changed.push(r.name ? `\u0441\u0442\u0430\u0442\u0443\u0441 \u2192 ${r.name}` : "\u0441\u0442\u0430\u0442\u0443\u0441 \u0441\u043D\u044F\u0442");
    }
    if (!changed.length) return fail("\u041D\u0435\u0447\u0435\u0433\u043E \u043C\u0435\u043D\u044F\u0442\u044C: \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u043F\u043E\u043B\u044F");
    if (newAssignee && newAssignee.id !== uid && newAssignee.id !== task.assigned_to) {
      await notify(supabase, "task_assigned", task.title, [newAssignee.id], task.id);
    }
    return {
      content: [{ type: "text", text: `\xAB${task.title}\xBB: ${changed.join(", ")}` }],
      structuredContent: { task_id: task.id, changed }
    };
  }
});

// src/lib/mcp/tools/add_comment.ts
import { defineTool as defineTool33 } from "npm:@lovable.dev/mcp-js@^0.24.0";
import { z as z33 } from "npm:zod@^4.4.3";
var add_comment_default = defineTool33({
  name: "add_comment",
  title: "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432 \u0447\u0430\u0442 \u0437\u0430\u0434\u0430\u0447\u0438",
  description: "\u0414\u043E\u0431\u0430\u0432\u043B\u044F\u0435\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 \u0447\u0430\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F, \u0441 \u043F\u043E\u043C\u0435\u0442\u043A\u043E\u0439, \u0447\u0442\u043E \u0435\u0433\u043E \u043D\u0430\u043F\u0438\u0441\u0430\u043B Claude. \u041F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0432 \u0437\u0430\u0434\u0430\u0447\u0435 \u0441\u0443\u0442\u044C \u043F\u0438\u0441\u044C\u043C\u0430 \u0438\u043B\u0438 \u043E\u0442\u0432\u0435\u0442\u0430. reply_to \u2014 id \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F, \u043D\u0430 \u043A\u043E\u0442\u043E\u0440\u043E\u0435 \u044D\u0442\u043E \u043E\u0442\u0432\u0435\u0442; \u0430\u0432\u0442\u043E\u0440 \u0442\u043E\u0433\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u043F\u043E\u043B\u0443\u0447\u0438\u0442 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435, \u043A\u0430\u043A \u0432 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0438.",
  inputSchema: {
    task_id: z33.string().uuid(),
    content: z33.string().min(1).max(4e3),
    reply_to: z33.string().uuid().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return fail("\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D");
    const uid = ctx.getUserId();
    const supabase = db4(ctx);
    const { data: task } = await supabase.from("tasks").select("id,title").eq("id", input.task_id).maybeSingle();
    if (!task) return fail("\u0417\u0430\u0434\u0430\u0447\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u0438\u043B\u0438 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430");
    let parentAuthor = null;
    if (input.reply_to) {
      const { data: parent } = await supabase.from("task_comments").select("user_id").eq("id", input.reply_to).eq("task_id", task.id).maybeSingle();
      if (!parent) return fail("\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 reply_to \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E \u0432 \u044D\u0442\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0435");
      parentAuthor = parent.user_id;
    }
    const { data, error } = await supabase.from("task_comments").insert({
      task_id: task.id,
      user_id: uid,
      content: input.content,
      reply_to: input.reply_to ?? null,
      // kind по умолчанию 'message' — обычное сообщение чата.
      // meta.via — пометка «написал Claude», как created_by у задач.
      meta: { via: "claude" }
    }).select("id,created_at").single();
    if (error) return fail(error.message);
    if (parentAuthor && parentAuthor !== uid) {
      await notify(supabase, "user_mentioned", `${task.title}: ${input.content.slice(0, 80)}`, [parentAuthor], task.id);
    }
    return {
      content: [{ type: "text", text: `\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D\u043E \u0432 \u0447\u0430\u0442 \u0437\u0430\u0434\u0430\u0447\u0438 \xAB${task.title}\xBB` }],
      structuredContent: { comment: data, task_id: task.id }
    };
  }
});

// src/lib/mcp/registry.ts
var TOOL_INSTRUCTIONS = "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B JustTODOit: \u0437\u0430\u0434\u0430\u0447\u0438, \u043F\u0440\u043E\u0435\u043A\u0442\u044B, \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B\u044B \u0432\u0441\u0442\u0440\u0435\u0447, CRM-\u043A\u043B\u0438\u0435\u043D\u0442\u044B. \u0412\u0441\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F \u2014 \u043E\u0442 \u0438\u043C\u0435\u043D\u0438 \u0437\u0430\u043B\u043E\u0433\u0438\u043D\u0435\u043D\u043D\u043E\u0433\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F, RLS \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442\u0441\u044F. \u0414\u0430\u0442\u044B \u0432 ISO 8601. \xAB\u0427\u0442\u043E \u0433\u043E\u0440\u0438\u0442\xBB, \xAB\u0447\u0442\u043E \u043D\u0430 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0435\xBB, \xAB\u0447\u0442\u043E \u0443 \u043C\u0435\u043D\u044F \u0431\u0435\u0437 \u0441\u0440\u043E\u043A\u043E\u0432\xBB \u2014 \u044D\u0442\u043E get_attention: \u043E\u043D \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u0441\u0440\u0430\u0437\u0443 \u043F\u043E \u0432\u0441\u0435\u043C \u043F\u0440\u043E\u0435\u043A\u0442\u0430\u043C, \u043D\u0430\u0437\u044B\u0432\u0430\u0442\u044C \u043F\u0440\u043E\u0435\u043A\u0442 \u043D\u0435 \u043D\u0443\u0436\u043D\u043E. \u041D\u0430\u0447\u0438\u043D\u0430\u0439 \u0441 \u043D\u0435\u0433\u043E, \u043A\u043E\u0433\u0434\u0430 \u0432\u043E\u043F\u0440\u043E\u0441 \u0431\u0435\u0437 \u0438\u043C\u0435\u043D\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430. \u041F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0441\u043E\u0432\u0435\u0449\u0430\u043D\u0438\u044F \u043E\u0444\u043E\u0440\u043C\u043B\u044F\u0435\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 create_protocol: \u043E\u043D \u0441\u043E\u0437\u0434\u0430\u0451\u0442\u0441\u044F \u0427\u0415\u0420\u041D\u041E\u0412\u0418\u041A\u041E\u041C \u2014 \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0438 \u0435\u0433\u043E \u043D\u0435 \u0432\u0438\u0434\u044F\u0442 \u0438 \u0443\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0430\u044E\u0442. \u041F\u043E\u043A\u0430\u0436\u0438 \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0438 \u043E\u043F\u0443\u0431\u043B\u0438\u043A\u0443\u0439 \u0447\u0435\u0440\u0435\u0437 publish_protocol \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u0441\u0432\u0435\u0440\u043A\u0438; \u043F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044F \u0432\u0438\u0434\u043D\u0430 \u043B\u044E\u0434\u044F\u043C \u0438 \u043D\u0435\u043E\u0442\u0437\u044B\u0432\u043D\u0430, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0431\u0435\u0437 apply=true \u043E\u043D\u0430 \u043B\u0438\u0448\u044C \u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u044F\u0435\u0442, \u0447\u0442\u043E \u0441\u0442\u0430\u043D\u0435\u0442 \u0432\u0438\u0434\u043D\u043E. \u0417\u0430\u0434\u0430\u0447\u0438 \u0438\u0437 \u043F\u0438\u0441\u0435\u043C \u0441\u043E\u0437\u0434\u0430\u0432\u0430\u0439 \u0441 source (\u0442\u0435\u043C\u0430, \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C, \u0434\u0430\u0442\u0430) \u2014 \u043F\u043E \u043D\u0435\u043C\u0443 \u043F\u043E\u0442\u043E\u043C \u0441\u0432\u0435\u0440\u044F\u044E\u0442\u0441\u044F \u043F\u0438\u0441\u044C\u043C\u0430 \u0441 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0447\u0435\u0440\u0435\u0437 search_tasks. \u0423 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0435\u0441\u0442\u044C work_mode: flow \u2014 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u044B\u0439 \u043F\u043E\u0442\u043E\u043A \u043F\u043E\u0440\u0443\u0447\u0435\u043D\u0438\u0439 (\u0432\u0435\u0445\u0438, \u0441\u0432\u044F\u0437\u0438 \u0438 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043F\u0443\u0442\u044C \u043A \u043D\u0435\u043C\u0443 \u043D\u0435 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F: \u0440\u0430\u0437\u0431\u0438\u0440\u0430\u0439 \u043F\u043E \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043D\u043E\u043C\u0443, \u0432\u0438\u0441\u044F\u043A\u0430\u043C \u0438 \u043B\u044E\u0434\u044F\u043C), plan \u2014 \u043F\u0440\u043E\u0435\u043A\u0442 \u0441 \u043F\u043B\u0430\u043D\u043E\u043C, null \u2014 \u043F\u0440\u0438\u0437\u043D\u0430\u043A \u043D\u0435 \u0437\u0430\u0434\u0430\u043D, \u0442\u043E\u0433\u0434\u0430 \u043D\u0435 \u0443\u0433\u0430\u0434\u044B\u0432\u0430\u0439, \u0430 \u0441\u043A\u0430\u0436\u0438 \u043E\u0431 \u044D\u0442\u043E\u043C. \u041F\u0440\u043E \u0441\u0440\u043E\u043A\u0438 \u0438 \u0437\u0430\u0432\u0438\u0441\u0438\u043C\u043E\u0441\u0442\u0438 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0441\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0439 get_project_schedule \u2014 \u0432\u0435\u0445\u0438, \u0437\u0430\u0434\u0430\u0447\u0438 \u0441 \u043D\u0430\u0447\u0430\u043B\u043E\u043C \u0438 \u043A\u043E\u043D\u0446\u043E\u043C, \u0441\u0432\u044F\u0437\u0438 \u043C\u0435\u0436\u0434\u0443 \u043D\u0438\u043C\u0438 \u0438 \u0437\u0430\u043F\u0430\u0441 \u043F\u043E \u0441\u0440\u043E\u043A\u0430\u043C \u043F\u0440\u0438\u0445\u043E\u0434\u044F\u0442 \u043E\u0434\u043D\u0438\u043C \u0432\u044B\u0437\u043E\u0432\u043E\u043C. \u041D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441 \xAB\u0447\u0442\u043E \u0434\u0435\u0440\u0436\u0438\u0442 \u0434\u0430\u0442\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430\xBB \u043E\u0442\u0432\u0435\u0447\u0430\u0439 \u043F\u043E critical_path \u0438 \u043F\u043E\u043B\u044E critical, \u043D\u0430 \xAB\u0435\u0441\u0442\u044C \u043B\u0438 \u043B\u044E\u0444\u0442\xBB \u2014 \u043F\u043E float_days; \u043E\u0442\u0440\u0438\u0446\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0437\u0430\u043F\u0430\u0441 \u0437\u043D\u0430\u0447\u0438\u0442, \u0447\u0442\u043E \u0441\u0432\u044F\u0437\u044C \u0443\u0436\u0435 \u043D\u0430\u0440\u0443\u0448\u0435\u043D\u0430. \u0412\u0435\u0445\u0438 \u0437\u0430\u0432\u043E\u0434\u044F\u0442\u0441\u044F \u0438 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 create_milestone \u0438 update_milestone; \u043F\u043B\u0430\u043D\u043E\u0432\u0430\u044F \u0438 \u0444\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0434\u0430\u0442\u044B \u2014 \u0440\u0430\u0437\u043D\u044B\u0435 \u0432\u0435\u0449\u0438, \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u043F\u043B\u0430\u043D\u0430 \u043D\u0435 \u0437\u043D\u0430\u0447\u0438\u0442 \u0434\u043E\u0441\u0442\u0438\u0436\u0435\u043D\u0438\u0435. \u0421\u0432\u044F\u0437\u0438 \xAB\u0447\u0442\u043E \u0437\u0430 \u0447\u0435\u043C \u0438\u0434\u0451\u0442\xBB \u0441\u043E\u0437\u0434\u0430\u044E\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 link_tasks \u0438 \u0441\u043D\u0438\u043C\u0430\u044E\u0442\u0441\u044F \u0447\u0435\u0440\u0435\u0437 unlink_tasks; \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0441\u0432\u044F\u0437\u0438 \u043F\u0440\u0435\u0435\u043C\u043D\u0438\u043A\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u0441\u0434\u0432\u0438\u0433\u0430\u044E\u0442\u0441\u044F \u0432\u043F\u0435\u0440\u0451\u0434 \u2014 \u0441\u0434\u0432\u0438\u043D\u0443\u0442\u043E\u0435 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442 \u0432 \u043E\u0442\u0432\u0435\u0442\u0435, \u043E \u043D\u0451\u043C \u0441\u0442\u043E\u0438\u0442 \u0441\u043A\u0430\u0437\u0430\u0442\u044C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443. \u041F\u0435\u0440\u0435\u043D\u043E\u0441 \u0441\u0440\u043E\u043A\u043E\u0432: preview_shift \u043F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u0447\u0442\u043E \u043F\u043E\u0442\u044F\u043D\u0435\u0442\u0441\u044F \u0437\u0430 \u0437\u0430\u0434\u0430\u0447\u0435\u0439, \u0431\u0435\u0437 \u0437\u0430\u043F\u0438\u0441\u0438; move_task \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u0435\u0442. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043A\u0430\u0436\u0438 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 preview_shift \u0438 \u043F\u043E\u043B\u0443\u0447\u0438 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u0435 \u2014 \u0441\u0434\u0432\u0438\u0433 \u0437\u0430\u0434\u0435\u0432\u0430\u0435\u0442 \u0447\u0443\u0436\u0438\u0435 \u0441\u0440\u043E\u043A\u0438, \u043E \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0443\u0436\u0435 \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438\u0441\u044C. \u041F\u0440\u0430\u0432\u043A\u0430 \u0441\u0440\u043E\u043A\u0430 \u043E\u0434\u043D\u043E\u0439 \u0437\u0430\u0434\u0430\u0447\u0438 \u0431\u0435\u0437 \u0445\u0432\u043E\u0441\u0442\u0430 \u2014 \u044D\u0442\u043E update_task. \u0414\u043D\u0438 \u0432\u0435\u0437\u0434\u0435 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u043D\u044B\u0435. \u0420\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u0440\u043E\u0442\u043E\u043A\u043E\u043B \u0438\u043B\u0438 \u043F\u0438\u0441\u044C\u043C\u043E \u0432 \u043F\u043B\u0430\u043D \u0446\u0435\u043B\u0438\u043A\u043E\u043C \u2014 upsert_plan: \u0437\u0430\u0434\u0430\u0447\u0438, \u0432\u0435\u0445\u0438 \u0438 \u0441\u0432\u044F\u0437\u0438 \u0437\u0430 \u043E\u0434\u0438\u043D \u0432\u044B\u0437\u043E\u0432. \u041F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u043E\u043D \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043F\u0438\u0448\u0435\u0442, \u0430 \u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0430\u0435\u0442 \u0440\u0430\u0437\u043B\u043E\u0436\u0435\u043D\u043D\u044B\u0439 \u043F\u043B\u0430\u043D; \u043F\u043E\u043A\u0430\u0436\u0438 \u0435\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443 \u0438 \u0437\u0430\u043F\u0438\u0448\u0438 \u0441 apply=true \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0433\u043B\u0430\u0441\u0438\u044F. \xAB\u0421\u0434\u0435\u043B\u0430\u0439 \u043F\u043B\u0430\u043D \u043F\u043E \u043F\u0440\u0438\u043C\u0435\u0440\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u0442\u0430\u043A\u043E\u0433\u043E-\u0442\u043E\xBB \u2014 apply_plan_template: \u0431\u0435\u0440\u0451\u0442 \u0444\u043E\u0440\u043C\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430-\u043E\u0431\u0440\u0430\u0437\u0446\u0430 (\u043F\u0440\u043E\u043C\u0435\u0436\u0443\u0442\u043A\u0438 \u043C\u0435\u0436\u0434\u0443 \u0437\u0430\u0434\u0430\u0447\u0430\u043C\u0438 \u0438 \u0441\u0432\u044F\u0437\u0438) \u0438 \u0440\u0430\u0441\u043A\u043B\u0430\u0434\u044B\u0432\u0430\u0435\u0442 \u043E\u0442 \u043D\u043E\u0432\u043E\u0439 \u0434\u0430\u0442\u044B; \u043F\u0440\u0430\u0432\u043A\u0438 \u0438\u0437 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F (\xAB\u043F\u0440\u0438\u0451\u043C\u043A\u0443 \u0432 \u0430\u043F\u0440\u0435\u043B\u0435\xBB) \u043F\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439 \u0432 overrides, \u043E\u043D\u0438 \u0434\u0432\u0438\u0433\u0430\u044E\u0442 \u0438 \u0442\u043E, \u0447\u0442\u043E \u0441\u0442\u043E\u0438\u0442 \u0437\u0430 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u043C. \u041A\u0430\u043A \u0438 upsert_plan, \u0431\u0435\u0437 apply=true \u043D\u0435 \u043F\u0438\u0448\u0435\u0442 \u043D\u0438\u0447\u0435\u0433\u043E. \u041D\u043E\u0432\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 \u043F\u043E\u0434 \u043F\u043B\u0430\u043D \u2014 create_project. \u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D: get_baseline \u0433\u043E\u0432\u043E\u0440\u0438\u0442, \u0438\u0434\u0451\u0442 \u0435\u0449\u0451 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 (\u043F\u0440\u0430\u0432\u043A\u0438 \u0441\u0440\u043E\u043A\u043E\u0432 \u0441\u0434\u0432\u0438\u0433\u043E\u043C \u043D\u0435 \u0441\u0447\u0438\u0442\u0430\u044E\u0442\u0441\u044F) \u0438\u043B\u0438 \u043F\u043B\u0430\u043D \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D (\u043A\u0430\u0436\u0434\u0430\u044F \u043F\u0440\u0430\u0432\u043A\u0430 \u2014 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u0435 \u0432 \u043F\u043E\u0440\u0442\u0444\u0435\u043B\u0435). \u0421\u043F\u0440\u0430\u0448\u0438\u0432\u0430\u0439 \u043F\u0435\u0440\u0435\u0434 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u043E\u043C \u0441\u0440\u043E\u043A\u043E\u0432 \u0438 \u0433\u043E\u0432\u043E\u0440\u0438 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0443, \u0437\u0430\u043F\u0438\u0448\u0435\u0442\u0441\u044F \u043B\u0438 \u0441\u0434\u0432\u0438\u0433. \u0424\u0438\u043A\u0441\u0430\u0446\u0438\u044F \u2014 lock_baseline: \u043E\u043D\u0430 \u043E\u0431\u043D\u0443\u043B\u044F\u0435\u0442 \u043D\u0430\u043A\u043E\u043F\u043B\u0435\u043D\u043D\u044B\u0435 \u043E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0438\u044F \u0431\u0435\u0437\u0432\u043E\u0437\u0432\u0440\u0430\u0442\u043D\u043E, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043A\u0430\u0436\u0438 \u043F\u043E\u0441\u043B\u0435\u0434\u0441\u0442\u0432\u0438\u044F (\u0431\u0435\u0437 apply=true \u043E\u043D \u0438\u0445 \u0442\u043E\u043B\u044C\u043A\u043E \u0441\u0447\u0438\u0442\u0430\u0435\u0442). \u0421\u043D\u044F\u0442\u044C \u2014 unlock_baseline. \u041A\u043E\u0433\u043E \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u0435\u043C \u2014 list_members; \u043A\u043E\u0433\u043E \u043F\u0435\u0440\u0435\u0433\u0440\u0443\u0437\u0438\u043B\u0438 \u043F\u043B\u0430\u043D\u043E\u043C \u2014 get_workload (\u044D\u0442\u043E \u0447\u0438\u0441\u043B\u043E \u043E\u0434\u043D\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447, \u0430 \u043D\u0435 \u0447\u0430\u0441\u044B: \u043E\u0446\u0435\u043D\u043E\u043A \u0442\u0440\u0443\u0434\u043E\u0451\u043C\u043A\u043E\u0441\u0442\u0438 \u0432 \u0441\u0438\u0441\u0442\u0435\u043C\u0435 \u043D\u0435\u0442, \u0442\u0430\u043A \u0438 \u0433\u043E\u0432\u043E\u0440\u0438). \u0423\u0431\u0440\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u043B\u0438 \u0432\u0435\u0445\u0438, \u0447\u0442\u043E\u0431\u044B \u043F\u0435\u0440\u0435\u0440\u0430\u0437\u043B\u043E\u0436\u0438\u0442\u044C \u043F\u043B\u0430\u043D, \u2014 delete_plan_items: \u0443\u0434\u0430\u043B\u0435\u043D\u0438\u0435 \u043D\u0430\u0441\u0442\u043E\u044F\u0449\u0435\u0435, \u043A\u043E\u0440\u0437\u0438\u043D\u044B \u043D\u0435\u0442, \u043F\u043E\u044D\u0442\u043E\u043C\u0443 \u0431\u0435\u0437 apply=true \u043E\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u0435\u0440\u0435\u0447\u0438\u0441\u043B\u044F\u0435\u0442, \u0447\u0442\u043E \u0438\u0441\u0447\u0435\u0437\u043D\u0435\u0442. \u041A\u0430\u0436\u0434\u044B\u0439 \u0432\u044B\u0437\u043E\u0432 \u043F\u0438\u0448\u0435\u0442\u0441\u044F \u0432 \u0436\u0443\u0440\u043D\u0430\u043B \u043E\u0431\u0440\u0430\u0449\u0435\u043D\u0438\u0439.";
var ALL_TOOLS = [
  get_attention_default,
  list_tasks_default,
  search_tasks_default,
  get_task_default,
  create_task_default,
  update_task_default,
  complete_task_default,
  update_task_deadline_default,
  add_comment_default,
  list_projects_default,
  get_project_default,
  get_project_schedule_default,
  create_milestone_default,
  update_milestone_default,
  link_tasks_default,
  unlink_tasks_default,
  preview_shift_default,
  move_task_default,
  upsert_plan_default,
  create_project_default,
  apply_plan_template_default,
  get_baseline_default,
  lock_baseline_default,
  unlock_baseline_default,
  list_members_default,
  get_workload_default,
  delete_plan_items_default,
  list_protocols_default,
  get_protocol_default,
  create_protocol_default,
  publish_protocol_default,
  list_clients_default,
  get_client_default
];

// src/lib/mcp/tools/_audit.ts
function withAudit(tool) {
  return {
    ...tool,
    handler: async (args, ctx) => {
      const start = Date.now();
      let result;
      let thrown;
      try {
        result = await tool.handler(args, ctx);
      } catch (e) {
        thrown = e;
      }
      if (ctx.isAuthenticated()) {
        const isError = thrown !== void 0 || !result || result.isError === true;
        const error = thrown !== void 0 ? String(thrown?.message ?? thrown).slice(0, 1e3) : isError ? (result?.content?.[0]?.text ?? "\u043F\u0443\u0441\u0442\u043E\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442").slice(0, 1e3) : null;
        try {
          const { error: e } = await db4(ctx).from("mcp_audit_log").insert({
            client_id: ctx.getClientId() ?? null,
            tool: tool.name,
            args: args ?? null,
            outcome: isError ? "error" : "ok",
            error,
            duration_ms: Date.now() - start
          });
          if (e) console.error("mcp_audit_log:", e.message);
        } catch (e) {
          console.error("mcp_audit_log:", e?.message ?? e);
        }
      }
      if (thrown !== void 0) {
        console.error(`mcp tool ${tool.name} threw:`, thrown?.stack ?? thrown);
        throw thrown;
      }
      return result;
    }
  };
}

// src/lib/assistant/toolLayer.ts
var TOOLS = ALL_TOOLS.map((t) => withAudit(t));
var BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
function objectSchema(tool) {
  return z34.object(tool.inputSchema ?? {});
}
function toolCatalog() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title ?? null,
    description: t.description ?? t.title ?? t.name,
    input_schema: z34.toJSONSchema(objectSchema(t), { io: "input" }),
    read_only: t.annotations?.readOnlyHint === true,
    destructive: t.annotations?.destructiveHint === true
  }));
}
function makeToolContext(ctx) {
  return {
    isAuthenticated: () => !!ctx.token && !!ctx.userId,
    getUserId: () => ctx.userId,
    getToken: () => ctx.token,
    getClientId: () => ctx.clientId ?? "in-app-assistant"
  };
}
async function runTool(name, rawInput, ctx) {
  const tool = BY_NAME.get(name);
  if (!tool) {
    return { ok: false, error: `\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430 \xAB${name}\xBB \u043D\u0435\u0442. \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u044B\u0435: ${[...BY_NAME.keys()].join(", ")}` };
  }
  if (!ctx.token || !ctx.userId) return { ok: false, error: "\u041D\u0435 \u0430\u0443\u0442\u0435\u043D\u0442\u0438\u0444\u0438\u0446\u0438\u0440\u043E\u0432\u0430\u043D" };
  const parsed2 = objectSchema(tool).safeParse(rawInput ?? {});
  if (!parsed2.success) {
    const problems = parsed2.error.issues.map((i) => `${i.path.join(".") || "\u0432\u0445\u043E\u0434"}: ${i.message}`).join("; ");
    return { ok: false, error: `\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u0430\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B \u0434\u043B\u044F ${name} \u2014 ${problems}` };
  }
  try {
    const result = await tool.handler(parsed2.data, makeToolContext(ctx));
    const text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    if (result?.isError) return { ok: false, error: text || "\u0418\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442 \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0448\u0438\u0431\u043A\u0443 \u0431\u0435\u0437 \u0442\u0435\u043A\u0441\u0442\u0430" };
    return { ok: true, text, structured: result?.structuredContent };
  } catch (e) {
    console.error(`assistant tool ${name} threw:`, e?.stack ?? e);
    return { ok: false, error: `\u0421\u0431\u043E\u0439 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u0430 ${name}: ${e?.message ?? e}` };
  }
}

// src/lib/assistant/edge.ts
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
var serve = globalThis.Deno?.serve;
serve?.(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "\u0422\u043E\u043B\u044C\u043A\u043E POST" }, 405);
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "\u041D\u0435\u0442 \u0442\u043E\u043A\u0435\u043D\u0430" }, 401);
  const supabase = createClient11(
    process11.env.SUPABASE_URL,
    process11.env.SUPABASE_PUBLISHABLE_KEY || process11.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (authError || !userId) return json({ error: "\u0422\u043E\u043A\u0435\u043D \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u0442" }, 401);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "\u0422\u0435\u043B\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0430 \u2014 \u043D\u0435 JSON" }, 400);
  }
  if (body.action === "catalog") {
    const tools = toolCatalog();
    return json({
      instructions: TOOL_INSTRUCTIONS,
      tools,
      counts: {
        total: tools.length,
        read_only: tools.filter((t) => t.read_only).length,
        destructive: tools.filter((t) => t.destructive).length
      }
    });
  }
  if (body.action === "call") {
    if (!body.tool) return json({ error: "\u041D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442" }, 400);
    const result = await runTool(body.tool, body.input, {
      token,
      userId,
      clientId: "in-app-assistant"
    });
    return json(result);
  }
  return json({ error: `\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u043E\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \xAB${body.action ?? ""}\xBB. \u0415\u0441\u0442\u044C catalog \u0438 call.` }, 400);
});
