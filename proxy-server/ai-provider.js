/**
 * AI provider abstraction.
 * Supports: openrouter, anthropic
 *
 * .env keys:
 *   AI_PROVIDER=openrouter|anthropic          (default: openrouter)
 *   OPENROUTER_API_KEY=sk-or-...
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   AI_MODEL_FAST=...   model for bulk/cheap tasks (categorisation)
 *   AI_MODEL_SMART=...  model for deep analysis (promises, dossier)
 */

import https from "https";

const PROVIDER = (process.env.AI_PROVIDER || "openrouter").toLowerCase();

// ── Default models ──────────────────────────────────────────────────────────
const DEFAULTS = {
  openrouter: {
    fast:  "google/gemini-flash-1.5",
    smart: "anthropic/claude-sonnet-4.6",
  },
  anthropic: {
    fast:  "claude-haiku-4-5-20251001",
    smart: "claude-sonnet-4-6",
  },
};

export const MODEL_FAST  = process.env.AI_MODEL_FAST  || DEFAULTS[PROVIDER]?.fast  || DEFAULTS.openrouter.fast;
export const MODEL_SMART = process.env.AI_MODEL_SMART || DEFAULTS[PROVIDER]?.smart || DEFAULTS.openrouter.smart;

// ── Shared system prompt ────────────────────────────────────────────────────
const SYSTEM = `Ты — корпоративный ИИ-ассистент для анализа электронной почты.
Отвечай ТОЛЬКО валидным JSON без markdown-обёрток и пояснений. Язык: русский.`;

// ── Low-level HTTPS POST ────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request(
      { hostname, path, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": buf.length, ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            resolve({ status: res.statusCode, data });
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

// ── OpenRouter ──────────────────────────────────────────────────────────────
async function callOpenRouter(messages, model) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY не задан в .env");

  const { status, data } = await httpsPost(
    "openrouter.ai",
    "/api/v1/chat/completions",
    {
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": "https://jtd.local",
      "X-Title": "JTD Mail AI",
    },
    { model, messages, temperature: 0.2 }
  );

  if (status !== 200) throw new Error(`OpenRouter ${status}: ${JSON.stringify(data)}`);
  return data.choices?.[0]?.message?.content ?? "{}";
}

// ── Anthropic ───────────────────────────────────────────────────────────────
async function callAnthropic(messages, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY не задан в .env");

  // Separate system from messages (Anthropic API requirement)
  const userMessages = messages.filter((m) => m.role !== "system");

  const { status, data } = await httpsPost(
    "api.anthropic.com",
    "/v1/messages",
    {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    { model, max_tokens: 2048, system: SYSTEM, messages: userMessages }
  );

  if (status !== 200) throw new Error(`Anthropic ${status}: ${JSON.stringify(data)}`);
  return data.content?.[0]?.text ?? "{}";
}

// ── Public: call AI ─────────────────────────────────────────────────────────
/**
 * @param {string} userPrompt
 * @param {"fast"|"smart"} tier
 * @returns {Promise<unknown>} parsed JSON
 */
export async function callAI(userPrompt, tier = "smart") {
  const model = tier === "fast" ? MODEL_FAST : MODEL_SMART;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user",   content: userPrompt },
  ];

  let rawText;
  if (PROVIDER === "anthropic") {
    rawText = await callAnthropic(messages, model);
  } else {
    rawText = await callOpenRouter(messages, model);
  }

  // Strip accidental markdown fences
  const cleaned = rawText.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Return as plain string if JSON parse fails — caller decides
    return { raw: cleaned };
  }
}

// ── Health info (for /health endpoint) ─────────────────────────────────────
export function aiProviderInfo() {
  const hasKey = PROVIDER === "anthropic"
    ? !!process.env.ANTHROPIC_API_KEY
    : !!process.env.OPENROUTER_API_KEY;

  return {
    provider: PROVIDER,
    keyPresent: hasKey,
    modelFast: MODEL_FAST,
    modelSmart: MODEL_SMART,
  };
}
