/**
 * Shared SSE streaming utility for AI chat responses.
 * Parses Server-Sent Events line-by-line for token-by-token rendering.
 */

export interface StreamChatOptions {
  url: string;
  body: Record<string, unknown>;
  onDelta: (text: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}

export class StreamChatError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function streamChat({ url, body, onDelta, onDone, signal }: StreamChatOptions) {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new StreamChatError(errData.error || "Stream failed", resp.status, errData);
  }

  if (!resp.body) throw new StreamChatError("No stream body", 500);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") {
        onDone();
        return;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Final flush
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw || raw.startsWith(":") || !raw.startsWith("data: ")) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        /* ignore partial leftovers */
      }
    }
  }

  onDone();
}
