// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_protocols",
  title: "Список протоколов встреч",
  description: "Возвращает протоколы (task_groups с project_type='protocol'). Фильтры: клиент, статус (draft/published), диапазон дат. В ответе есть total и has_more: если has_more=true, показаны не все записи — не судите о количестве по длине списка.",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    status: z.enum(["draft", "published"]).optional(),
    date_from: z.string().optional().describe("ISO date, включительно"),
    date_to: z.string().optional().describe("ISO date, включительно"),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional().describe("Сколько записей пропустить. Для постраничного обхода, когда has_more=true."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const limit = input.limit ?? 50;
    const offset = input.offset ?? 0;
    let q = supabase
      .from("task_groups")
      // Колонок protocol_status/protocol_date нет: статус протокола — draft_status,
      // дата встречи — protocol_meta.meeting_date (строка ГГГГ-ММ-ДД).
      .select("id,name,description,client_id,created_at,status:draft_status,meeting_date:protocol_meta->>meeting_date", { count: "exact" })
      .eq("project_type", "protocol")
      .order("protocol_meta->>meeting_date", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
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
      content: [{ type: "text", text: hasMore
        ? `Показано ${rows.length} протоколов из ${total} (пропущено ${offset}). Это НЕ все: повторите с offset=${offset + rows.length} или сузьте фильтр.`
        : `Показано ${rows.length} протоколов из ${total} — это все, что подходят под фильтр.` }],
      structuredContent: { protocols: rows, total, returned: rows.length, offset, has_more: hasMore },
    };
  },
});