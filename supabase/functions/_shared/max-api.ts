// Shared MAX messenger (platform-api.max.ru) helpers.
// MAX is a SECOND, alternative channel alongside Telegram — never a replacement.
// We talk to the MAX Bot API directly with a bot token (MAX is not behind the
// Lovable connector gateway), exactly like the Telegram integration does.

export const MAX_API_BASE = "https://platform-api.max.ru";

/** A single inline-keyboard button (callback type). */
export interface MaxInlineButton {
  text: string;
  payload: string;
}

/** Returns the configured MAX bot token or null if not set yet. */
export function getMaxToken(): string | null {
  return Deno.env.get("MAX_BOT_TOKEN") ?? null;
}

/**
 * Send a text message to a MAX user (DM) or chat.
 * Provide exactly one of `userId` / `chatId`.
 */
export async function sendMaxMessage(
  token: string,
  target: { userId?: number; chatId?: number },
  text: string,
  opts: { format?: "markdown" | "html"; notify?: boolean; keyboard?: MaxInlineButton[][] } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const params = new URLSearchParams();
  if (target.userId != null) params.set("user_id", String(target.userId));
  if (target.chatId != null) params.set("chat_id", String(target.chatId));

  const body: Record<string, unknown> = { text };
  if (opts.format) body.format = opts.format;
  if (opts.notify === false) body.notify = false;
  if (opts.keyboard && opts.keyboard.length > 0) {
    body.attachments = [
      {
        type: "inline_keyboard",
        payload: {
          buttons: opts.keyboard.map((row) =>
            row.map((b) => ({ type: "callback", text: b.text, payload: b.payload })),
          ),
        },
      },
    ];
  }

  const res = await fetch(`${MAX_API_BASE}/messages?${params.toString()}`, {
    method: "POST",
    headers: {
      // MAX requires the raw token in the Authorization header (no "Bearer").
      "Authorization": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/**
 * Acknowledge an inline-button press. MAX shows `notification` as a toast and,
 * if `text` is provided, edits the original message in place.
 */
export async function answerMaxCallback(
  token: string,
  callbackId: string,
  notification?: string,
  newText?: string,
): Promise<{ ok: boolean; status: number }> {
  const params = new URLSearchParams({ callback_id: callbackId });
  const body: Record<string, unknown> = {};
  if (notification) body.notification = notification;
  if (newText) body.message = { text: newText };

  const res = await fetch(`${MAX_API_BASE}/answers?${params.toString()}`, {
    method: "POST",
    headers: { "Authorization": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

/** Fetch the bot's own profile (GET /me) — used to build deep-links. */
export async function getMaxBotInfo(
  token: string,
): Promise<{ user_id: number; name: string; username: string } | null> {
  const res = await fetch(`${MAX_API_BASE}/me`, {
    method: "GET",
    headers: { "Authorization": token },
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** A single bot command shown in MAX's "/" command hint menu. */
export interface MaxBotCommand {
  name: string;
  description: string;
}

/**
 * Register the bot's command list (PATCH /me) so MAX shows hints when the user
 * types "/" — both in DMs and in groups. Command names must be lowercase
 * latin/digits/underscore. This mirrors Telegram's setMyCommands.
 */
export async function setMaxCommands(
  token: string,
  commands: MaxBotCommand[],
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${MAX_API_BASE}/me`, {
    method: "PATCH",
    headers: { "Authorization": token, "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}