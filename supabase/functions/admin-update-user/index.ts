// Admin-only edge function: update user's password and/or telegram_username.
// Caller must be authenticated AND have role='admin' in user_roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing_auth" }, 401);
    }

    // Identify caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check admin role
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId: string | undefined = body.target_user_id;
    const newPassword: string | undefined = body.new_password;
    const newTelegram: string | null | undefined = body.telegram_username;
    const newEmail: string | undefined = body.email;
    const newDisplayName: string | undefined = body.display_name;
    const action: string | undefined = body.action;
    // 'reset_via_telegram' | 'sign_out_everywhere' | 'confirm_email'
    // | 'impersonate' | 'bind_telegram_chat' | 'unbind_telegram_chat'
    // ('send_recovery' — отключено 06.10.2026: почта не уходит, см. ниже)

    if (!targetUserId) return json({ error: "missing_target" }, 400);

    // Письмо для сброса пароля не уходит: почта не работает (решение владельца
    // 27.09 — не чиним, возврат доступа через Telegram). Прежде generateLink
    // только создавал ссылку, а интерфейс сообщал «письмо отправлено». Действие
    // оставлено, чтобы старая вкладка не получила «неизвестное действие», но
    // честно отказывает.
    if (action === "send_recovery") {
      return json({ error: "email_disabled", message: "Почта не отправляется. Используйте «Сбросить пароль и прислать в Telegram»." }, 400);
    }

    // Новый временный пароль — человеку в Telegram от бота, вместе с логином
    // (06.10.2026). Без привязанного личного чата — отказ: тогда пароль задаёт
    // администратор выше и передаёт сам.
    if (action === "reset_via_telegram") {
      const { data: target, error: tErr } = await admin.auth.admin.getUserById(targetUserId);
      if (tErr || !target?.user?.email) return json({ error: "user_not_found", message: "Пользователь не найден" }, 404);
      const { data: prof } = await admin.from("profiles").select("telegram_chat_id").eq("id", targetUserId).maybeSingle();
      const chat = Number(prof?.telegram_chat_id ?? 0);
      if (!(chat > 0)) {
        return json({ error: "no_telegram", message: "У пользователя не привязан Telegram — задайте пароль выше и передайте его лично." }, 400);
      }
      const BOT = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (!BOT) return json({ error: "no_bot", message: "Бот не настроен" }, 500);
      // Без похожих символов (0/O, 1/l/I) — чтобы не ошибиться при наборе.
      const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const rnd = new Uint32Array(10);
      crypto.getRandomValues(rnd);
      const pw = Array.from(rnd, (n) => alphabet[n % alphabet.length]).join("");
      const { error: pErr } = await admin.auth.admin.updateUserById(targetUserId, { password: pw });
      if (pErr) return json({ error: "reset_failed", message: pErr.message }, 400);
      const text =
        "🔑 Доступ в JustTODOit\n\n" +
        "Сайт: https://justtodoit.ru\n" +
        `Логин: ${target.user.email}\n` +
        `Пароль: ${pw}\n\n` +
        "Логин — это почта, вводите её целиком. После входа смените пароль в настройках профиля, а это сообщение удалите.";
      const tg = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
      });
      if (!tg.ok) {
        return json({ error: "telegram_failed", message: "Пароль сброшен, но Telegram не доставил сообщение (возможно, бот заблокирован). Задайте пароль выше и передайте лично." }, 502);
      }
      return json({ ok: true });
    }

    // Action: revoke all sessions
    if (action === "sign_out_everywhere") {
      const { error: sErr } = await admin.auth.admin.signOut(targetUserId, "global");
      if (sErr) return json({ error: "signout_failed", message: sErr.message }, 400);
      return json({ ok: true });
    }

    // Action: manually confirm email
    if (action === "confirm_email") {
      const { error: cErr } = await admin.auth.admin.updateUserById(targetUserId, {
        email_confirm: true,
      });
      if (cErr) return json({ error: "confirm_failed", message: cErr.message }, 400);
      return json({ ok: true });
    }

    // Action: impersonate (generate magic link admin can open)
    if (action === "impersonate") {
      const { data: target, error: tErr } = await admin.auth.admin.getUserById(targetUserId);
      if (tErr || !target?.user?.email) return json({ error: "user_not_found" }, 404);
      const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: target.user.email,
        options: { redirectTo: body.redirect_to as string | undefined },
      });
      if (lErr) return json({ error: "link_failed", message: lErr.message }, 400);
      return json({ ok: true, action_link: (linkData as any)?.properties?.action_link ?? null });
    }

    // Action: bind/unbind telegram_chat_id directly
    if (action === "bind_telegram_chat") {
      const raw = String(body.telegram_chat_id ?? "").trim();
      if (!/^-?\d{4,20}$/.test(raw)) {
        return json({ error: "invalid_chat_id", message: "chat_id должен быть числом" }, 400);
      }
      const { error: bErr } = await admin
        .from("profiles")
        .update({ telegram_chat_id: raw })
        .eq("id", targetUserId);
      if (bErr) return json({ error: "bind_failed", message: bErr.message }, 400);
      return json({ ok: true });
    }
    if (action === "unbind_telegram_chat") {
      const { error: uErr } = await admin
        .from("profiles")
        .update({ telegram_chat_id: null })
        .eq("id", targetUserId);
      if (uErr) return json({ error: "unbind_failed", message: uErr.message }, 400);
      return json({ ok: true });
    }

    // Update auth.users (password / email)
    const authPatch: Record<string, unknown> = {};
    if (newPassword) {
      if (newPassword.length < 6) return json({ error: "password_too_short" }, 400);
      authPatch.password = newPassword;
    }
    if (newEmail !== undefined && newEmail !== null) {
      authPatch.email = newEmail;
      authPatch.email_confirm = true;
    }
    if (Object.keys(authPatch).length > 0) {
      const { error: aErr } = await admin.auth.admin.updateUserById(targetUserId, authPatch);
      if (aErr) return json({ error: "auth_update_failed", message: aErr.message }, 400);
    }

    // Update profile (telegram_username, email mirror)
    const profilePatch: Record<string, unknown> = {};
    if (newTelegram !== undefined) {
      const cleaned = newTelegram === null
        ? null
        : String(newTelegram).trim().replace(/^@/, "").toLowerCase() || null;
      profilePatch.telegram_username = cleaned;
      // reset chat link so user re-binds with /start link_<id>
      profilePatch.telegram_chat_id = null;
    }
    if (newEmail !== undefined && newEmail !== null) profilePatch.email = newEmail;
    if (newDisplayName !== undefined) profilePatch.display_name = newDisplayName;

    if (Object.keys(profilePatch).length > 0) {
      const { error: pErr } = await admin.from("profiles").update(profilePatch).eq("id", targetUserId);
      if (pErr) return json({ error: "profile_update_failed", message: pErr.message }, 400);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: "internal", message: String((e as Error)?.message ?? e) }, 500);
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});