// Глобального process в edge-runtime (Deno 1.45) нет — только импортом.
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { runTool, toolCatalog, TOOL_INSTRUCTIONS } from "./toolLayer";

/**
 * Функция `assistant-tools` — вход для ассистента ВНУТРИ приложения.
 *
 * Отдаёт два действия:
 *   { action: "catalog" }                  → каталог инструментов и правила работы
 *   { action: "call", tool, input }        → выполнить инструмент
 *
 * Инструменты те же, что у коннектора (33), и берутся из общего реестра. Модель
 * здесь не вызывается вовсе: это слой доступа, а выбор модели и цикл вызовов
 * будут отдельно. Так эту часть можно выкатить и проверить раньше, чем появится
 * ключ Anthropic, и она ничего не стоит в деньгах.
 *
 * Права — токеном самого пользователя, как в коннекторе: инструменты создают
 * клиента базы с его токеном, RLS применяется. Служебный ключ здесь не
 * используется НИГДЕ, и это не перестраховка: ассистент, которому видно больше,
 * чем человеку, однажды покажет ему чужое.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Deno.serve в типах браузерного проекта нет — функция собирается для
// edge-runtime, а проверяется тем же tsc, что и фронтенд.
const serve = (globalThis as unknown as { Deno?: { serve?: (h: (r: Request) => Promise<Response>) => void } }).Deno
  ?.serve;

serve?.(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Только POST" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Нет токена" }, 401);

  // Кто пришёл — спрашиваем у GoTrue его же токеном. Разбирать JWT самим здесь
  // незачем: проверка подписи и срока — работа сервера авторизации.
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (authError || !userId) return json({ error: "Токен не принят" }, 401);

  let body: { action?: string; tool?: string; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Тело запроса — не JSON" }, 400);
  }

  if (body.action === "catalog") {
    const tools = toolCatalog();
    return json({
      instructions: TOOL_INSTRUCTIONS,
      tools,
      counts: {
        total: tools.length,
        read_only: tools.filter((t) => t.read_only).length,
        destructive: tools.filter((t) => t.destructive).length,
      },
    });
  }

  if (body.action === "call") {
    if (!body.tool) return json({ error: "Не указан инструмент" }, 400);
    const result = await runTool(body.tool, body.input, {
      token,
      userId,
      clientId: "in-app-assistant",
    });
    // Отказ инструмента — это ответ, а не сбой запроса: 200 с ok:false, чтобы
    // вызывающая сторона отличала «инструмент сказал нет» от «функция упала».
    return json(result);
  }

  return json({ error: `Неизвестное действие «${body.action ?? ""}». Есть catalog и call.` }, 400);
});
