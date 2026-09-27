// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { resolveNames, shapeTask } from "./_names";

function db(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const SELECT =
  "id,title,description,deadline,is_completed,is_important,priority,group_id,client_id,assigned_to";

/**
 * Поиск задач по тексту.
 *
 * Зачем: главный пробел для сценария с разбором почты. Сверять письма с уже
 * существующими задачами было нечем — ни одного инструмента поиска не было, а
 * list_tasks отдаёт первые 50 по дедлайну. При 5720 открытых задачах шанс, что
 * нужная окажется в этой выборке, ничтожен.
 *
 * Почему два отдельных запроса, а не один с or(). PostgREST разбирает or() как
 * строку со своим синтаксисом: запятая, скобки и точка в тексте запроса ломают
 * условие, а подобранная строка может изменить его смысл. Здесь берётся тот же
 * приём, что в GlobalSearch на фронтенде: два ilike и слияние по id. Значение
 * уходит отдельным параметром, а не склейкой в выражение.
 */
export default defineTool({
  name: "search_tasks",
  title: "Поиск задач по тексту",
  description:
    "Ищет задачи по подстроке в названии и описании. Нужен, чтобы сверить письмо или обсуждение с уже существующими задачами и не создать дубль. Регистр не важен. Возвращает has_more: при true найдено больше, чем показано — уточните запрос. Точное общее число не возвращается: поиск идёт по двум полям и объединяет совпадения.",
  inputSchema: {
    query: z
      .string()
      .min(2)
      .max(200)
      .describe("Подстрока для поиска в названии и описании. Не короче двух символов."),
    include_completed: z.boolean().optional().describe("Искать и среди закрытых задач. По умолчанию нет."),
    project_id: z.string().uuid().optional().describe("Ограничить одним проектом (task_groups.id)."),
    limit: z.number().int().min(1).max(100).optional().describe("Максимум задач в ответе. По умолчанию 30."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Не аутентифицирован" }], isError: true };
    }
    const supabase = db(ctx);
    const limit = input.limit ?? 30;

    // Символы, значимые для LIKE, экранируем: иначе "50%" или "a_b" из письма
    // превратятся в шаблон и найдут лишнее. Обратный слэш — первым.
    const escaped = input.query.replace(/[\\%_]/g, (m) => "\\" + m);
    const pattern = `%${escaped}%`;

    const base = (field: "title" | "description") => {
      let q = supabase.from("tasks").select(SELECT).ilike(field, pattern).limit(limit);
      if (!input.include_completed) q = q.eq("is_completed", false);
      if (input.project_id) q = q.eq("group_id", input.project_id);
      return q;
    };

    const [byTitle, byDescription] = await Promise.all([base("title"), base("description")]);
    const failed = byTitle.error ?? byDescription.error;
    if (failed) return { content: [{ type: "text", text: failed.message }], isError: true };

    // Слияние по id: задача может совпасть и по названию, и по описанию.
    // Совпадения в названии идут первыми — они точнее.
    const seen = new Set<string>();
    const merged: NonNullable<typeof byTitle.data> = [];
    for (const row of [...(byTitle.data ?? []), ...(byDescription.data ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }

    // Признак «есть ещё» честный: любой из двух запросов упёрся в лимит,
    // значит выдача заведомо неполная. Точного общего числа здесь не будет —
    // объединение двух выборок его не даёт, и выдумывать его нельзя.
    const hasMore =
      (byTitle.data?.length ?? 0) >= limit || (byDescription.data?.length ?? 0) >= limit;

    const rows = merged.slice(0, limit);
    const names = await resolveNames(supabase, rows);
    const shaped = rows.map((t) => shapeTask(t, names));

    const text = shaped.length === 0
      ? `По запросу «${input.query}» задач не найдено${input.include_completed ? "" : " среди открытых (закрытые не искались)"}.`
      : hasMore
        ? `Найдено больше, чем показано: ${shaped.length} задач по запросу «${input.query}». Уточните запрос — это НЕ все совпадения.`
        : `Найдено ${shaped.length} задач по запросу «${input.query}» — это все совпадения.`;

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        tasks: shaped,
        returned: shaped.length,
        has_more: hasMore,
        query: input.query,
        searched_completed: input.include_completed ?? false,
      },
    };
  },
});
