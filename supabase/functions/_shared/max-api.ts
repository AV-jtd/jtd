// Shared MAX messenger (platform-api.max.ru) helpers.
// MAX is a SECOND, alternative channel alongside Telegram — never a replacement.
// We talk to the MAX Bot API directly with a bot token (MAX is not behind the
// Lovable connector gateway), exactly like the Telegram integration does.

export const MAX_API_BASE = "https://platform-api.max.ru";

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
  opts: { format?: "markdown" | "html"; notify?: boolean } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const params = new URLSearchParams();
  if (target.userId != null) params.set("user_id", String(target.userId));
  if (target.chatId != null) params.set("chat_id", String(target.chatId));

  const body: Record<string, unknown> = { text };
  if (opts.format) body.format = opts.format;
  if (opts.notify === false) body.notify = false;

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