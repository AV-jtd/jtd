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
  name: "list_clients",
  title: "Список CRM-клиентов",
  description: "Возвращает CRM-клиентов. Можно искать по имени и фильтровать по территории/рангу/менеджеру. В ответе есть total и has_more: если has_more=true, показаны не все записи — не судите о количестве по длине списка.",
  inputSchema: {
    search: z.string().optional().describe("Подстрока в имени клиента"),
    territory: z.string().optional().describe("Название территории (тег), без учёта регистра"),
    rank: z.string().optional().describe("Название ранга (тег), без учёта регистра"),
    manager_id: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional().describe("Сколько записей пропустить. Для постраничного обхода, когда has_more=true."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    const supabase = db(ctx);
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    // Территория, ранг и тип розницы — ссылки на теги (*_tag_id), а не текст.
    // Колонок territory/rank/retail_type нет: инструмент падал на первом вызове.
    const tagIds = async (name: string) => {
      const { data } = await supabase.from("tags").select("id").ilike("name", name.replace(/[%_\\]/g, "\\$&"));
      return (data ?? []).map((t) => t.id);
    };
    let q = supabase
      .from("clients")
      .select(
        "id,name,city,manager_id,logo_url," +
          "territory:tags!clients_territory_tag_id_fkey(name)," +
          "rank:tags!clients_rank_tag_id_fkey(name)," +
          "retail_type:tags!clients_retail_type_tag_id_fkey(name)",
        { count: "exact" },
      )
      .order("name")
      .range(offset, offset + limit - 1);
    if (input.search) q = q.ilike("name", `%${input.search}%`);
    if (input.territory) q = q.in("territory_tag_id", await tagIds(input.territory));
    if (input.rank) q = q.in("rank_tag_id", await tagIds(input.rank));
    if (input.manager_id) q = q.eq("manager_id", input.manager_id);
    const { data, error, count } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    // Встраивания приходят объектами { name } — отдаём просто названия.
    const rows = (data ?? []).map((c: any) => ({
      ...c,
      territory: c.territory?.name ?? null,
      rank: c.rank?.name ?? null,
      retail_type: c.retail_type?.name ?? null,
    }));
    const total = count ?? rows.length;
    const hasMore = offset + rows.length < total;
    return {
      content: [{ type: "text", text: hasMore
        ? `Показано ${rows.length} клиентов из ${total} (пропущено ${offset}). Это НЕ все: повторите с offset=${offset + rows.length} или сузьте фильтр.`
        : `Показано ${rows.length} клиентов из ${total} — это все, что подходят под фильтр.` }],
      structuredContent: { clients: rows, total, returned: rows.length, offset, has_more: hasMore },
    };
  },
});