/**
 * Серверный guard: блокирует вызов edge-функции от пользователя с ролью `consultant`.
 *
 * Используется как дополнительный слой защиты поверх RLS — на случай, если
 * consultant получит JWT и попытается дёрнуть edge-функцию напрямую,
 * минуя UI-ограничения (`<ConsultantGuard>`).
 *
 * Поведение:
 *  - Нет `Authorization` header → пропуск (cron / публичные вызовы по токену).
 *  - JWT есть, но невалиден → пропуск (auth.getUser вернёт null,
 *    дальше функция сама решит, что делать).
 *  - JWT валиден и user — consultant → возвращает Response 403.
 *  - Иначе → null (продолжаем выполнение).
 *
 * Использование:
 *   const blocked = await blockConsultant(req);
 *   if (blocked) return blocked;
 *
 * См. mem://constraints/external-users-default — обязательная проверка
 * для всех edge-функций, обходящих RLS через service_role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface BlockOptions {
  /** Доп. CORS-заголовки конкретной функции (по умолчанию — стандартные). */
  corsHeaders?: Record<string, string>;
  /** Сообщение в теле ответа. */
  message?: string;
}

/**
 * Возвращает 403 Response, если запрос пришёл от consultant.
 * Возвращает null, если можно продолжать.
 */
export async function blockConsultant(
  req: Request,
  opts: BlockOptions = {},
): Promise<Response | null> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) return null;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await client.auth.getUser();
  const user = userData?.user;
  if (!user) return null;

  // RPC `is_consultant` — security definer, читает user_roles.
  const { data: isConsultant } = await client.rpc("is_consultant", {
    _user_id: user.id,
  });

  if (isConsultant === true) {
    const headers = { ...CORS_HEADERS, ...(opts.corsHeaders ?? {}), "Content-Type": "application/json" };
    return new Response(
      JSON.stringify({
        error: "forbidden",
        reason: "consultant_role_blocked",
        message: opts.message ?? "Эта функция доступна только сотрудникам компании.",
      }),
      { status: 403, headers },
    );
  }

  return null;
}