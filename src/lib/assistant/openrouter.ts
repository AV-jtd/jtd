/**
 * Один ход модели через OpenRouter — для цикла ассистента (agent.ts).
 *
 * Провайдер — OpenRouter, модель — Claude (решение владельца 30.09.2026: ключ
 * Anthropic не заводим, тот же OPENROUTER_API_KEY). Модель меняется переменной
 * ASSISTANT_MODEL без правки кода.
 *
 * Кэширование. Неизменная часть запроса — каталог инструментов (~21 тыс.
 * токенов), правила работы с ними и роль ассистента — помечена cache_control.
 * Замер 30.09: первый запрос $0.054 (запись в кэш), следующий — $0.0057, в 10
 * раз дешевле. Меняющееся (дата, что человек сейчас смотрит) стоит ПОСЛЕ точки
 * кэша, иначе каждый запрос писал бы кэш заново.
 */

import type { ChatMessage, ToolCall } from "./agent";

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

export type ModelTool = { name: string; description: string; input_schema: Record<string, unknown> };

export class ModelError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function buildRequest(opts: {
  model: string;
  staticSystem: string;
  dynamicSystem: string;
  tools: ModelTool[];
  messages: ChatMessage[];
}) {
  const tools = opts.tools.map((t, i) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
    // Точка кэша на последнем инструменте: кэшируется весь каталог.
    ...(i === opts.tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));
  return {
    model: opts.model,
    messages: [
      {
        role: "system",
        content: [
          { type: "text", text: opts.staticSystem, cache_control: { type: "ephemeral" } },
          { type: "text", text: opts.dynamicSystem },
        ],
      },
      ...opts.messages,
    ],
    tools,
    max_tokens: 2000,
    usage: { include: true },
  };
}

export async function callOpenRouter(opts: {
  apiKey: string;
  model: string;
  staticSystem: string;
  dynamicSystem: string;
  tools: ModelTool[];
  messages: ChatMessage[];
  fetchImpl?: typeof fetch;
}): Promise<{ content: string | null; tool_calls?: ToolCall[]; cost?: number }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://justtodoit.ru",
      "X-Title": "JustTODOit",
    },
    body: JSON.stringify(buildRequest(opts)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ModelError(res.status, text.slice(0, 500) || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new ModelError(502, "Пустой ответ модели");
  return {
    content: typeof msg.content === "string" && msg.content.trim() ? msg.content : null,
    tool_calls: Array.isArray(msg.tool_calls) && msg.tool_calls.length ? msg.tool_calls : undefined,
    cost: data?.usage?.cost,
  };
}
