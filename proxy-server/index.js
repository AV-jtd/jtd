import http from "http";
import https from "https";
import { URL } from "url";

const SUPABASE_ORIGIN = "https://nvfioycpwyzwukvokwql.supabase.co";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------
function setCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-expose-headers", "*");
}

// ---------------------------------------------------------------------------
// Read full request body
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// AI analysis via Anthropic claude-sonnet-4-6
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Ты — корпоративный ИИ-ассистент для анализа электронной почты.
Отвечай только в формате JSON без markdown-обёртки.
Язык ответа: русский.`;

const ANALYSIS_SCHEMA = `{
  "summary": "краткое резюме 1-2 предложения",
  "keyPoints": ["ключевой момент 1", "ключевой момент 2"],
  "actionItems": ["действие 1", "действие 2"],
  "priority": "low|medium|high",
  "sentiment": "positive|neutral|negative",
  "tags": ["тег1", "тег2"]
}`;

const DAY_SUMMARY_SCHEMA = `{
  "totalEmails": число,
  "unreadCount": число,
  "topThreads": [{"subject": "...", "count": число, "insight": "кратко о теме"}],
  "topPeople": [{"name": "...", "email": "...", "count": число}],
  "actionItems": ["срочное действие 1", "действие 2"],
  "overallInsight": "общий вывод о дне в 2-3 предложениях",
  "byProject": [{"project": "название проекта/темы", "count": число, "summary": "кратко"}]
}`;

async function callClaude(userMessage, schema) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${userMessage}\n\nВерни ответ строго в формате JSON:\n${schema}`,
        },
      ],
    });

    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString());
            if (data.error) return reject(new Error(data.error.message));
            const text = data.content?.[0]?.text || "{}";
            // Strip markdown code fences if present
            const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
            resolve(JSON.parse(cleaned));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function buildEmailPrompt(data) {
  return `Проанализируй письмо:
Тема: ${data.subject}
От: ${data.from}
Дата: ${data.date}
Текст: ${data.body?.substring(0, 2000) || "(нет текста)"}`;
}

function buildThreadPrompt(data) {
  const msgs = data.emails
    .map((e, i) => `[${i + 1}] От: ${e.from} (${e.date})\n${e.body}`)
    .join("\n---\n");
  return `Проанализируй переписку по теме "${data.subject}".
Участники: ${data.participants?.join(", ")}

Сообщения:
${msgs}`;
}

function buildDaySummaryPrompt(data) {
  const threads = data.topThreads
    .map((t) => `- "${t.subject}" (${t.count} писем): ${t.emails?.map((e) => e.body).join(" | ")}`)
    .join("\n");
  const people = data.topPeople.map((p) => `- ${p.name} (${p.count})`).join("\n");
  const samples = data.sampleBodies
    ?.map((e) => `От ${e.from}: [${e.subject}] ${e.body}`)
    .join("\n") || "";

  return `Создай дайджест рабочего дня по входящей почте.

Статистика: ${data.totalEmails} писем всего, ${data.unreadCount} непрочитанных.

Топ переписок:
${threads}

Активные отправители:
${people}

Образцы непрочитанных писем:
${samples}

Определи проекты/темы, выдели срочные задачи, дай общий вывод.`;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // AI analyze endpoint
  if (req.method === "POST" && req.url === "/api/ai/analyze") {
    try {
      const rawBody = await readBody(req);
      const { type, data } = JSON.parse(rawBody);

      let prompt, schema;
      if (type === "email") {
        prompt = buildEmailPrompt(data);
        schema = ANALYSIS_SCHEMA;
      } else if (type === "thread") {
        prompt = buildThreadPrompt(data);
        schema = ANALYSIS_SCHEMA;
      } else if (type === "day_summary") {
        prompt = buildDaySummaryPrompt(data);
        schema = DAY_SUMMARY_SCHEMA;
      } else {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Unknown type" }));
        return;
      }

      const result = await callClaude(prompt, schema);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error("AI error:", err.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Supabase proxy (all other routes)
  const target = new URL(req.url, SUPABASE_ORIGIN);
  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };
  delete options.headers["origin"];
  delete options.headers["referer"];

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-expose-headers": "*",
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502);
    res.end("Bad Gateway");
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`Proxy + AI running on port ${PORT}`);
  if (!ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY не задан — AI endpoints не будут работать");
  }
});
