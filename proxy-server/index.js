import "dotenv/config";
import http from "http";
import https from "https";
import { URL } from "url";
import { callAI, aiProviderInfo } from "./ai-provider.js";
import {
  buildCategorisePrompt,
  buildEmailAnalysisPrompt,
  buildThreadAnalysisPrompt,
  buildDaySummaryPrompt,
  buildPromisesPrompt,
  buildPersonDossierPrompt,
} from "./mail-prompts.js";

const SUPABASE_ORIGIN = "https://nvfioycpwyzwukvokwql.supabase.co";
const PORT = process.env.PORT || 3000;

// ── Helpers ──────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleAI(req, res) {
  const raw = await readBody(req);
  const { type, data } = JSON.parse(raw);

  let builder;
  switch (type) {
    case "categorise":        builder = buildCategorisePrompt(data);         break;
    case "email":             builder = buildEmailAnalysisPrompt(data);       break;
    case "thread":            builder = buildThreadAnalysisPrompt(data);      break;
    case "day_summary":       builder = buildDaySummaryPrompt(data);          break;
    case "promises":          builder = buildPromisesPrompt(data);            break;
    case "person_dossier":    builder = buildPersonDossierPrompt(data);       break;
    default:
      return json(res, 400, { error: `Unknown type: ${type}` });
  }

  const result = await callAI(builder.prompt, builder.tier);
  json(res, 200, result);
}

function handleHealth(res) {
  const info = aiProviderInfo();
  json(res, 200, {
    status: "ok",
    ...info,
    tip: info.keyPresent
      ? "Ключ найден — AI готов к работе ✓"
      : `Ключ не найден. Добавьте ${info.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENROUTER_API_KEY"} в файл .env`,
  });
}

// ── Main server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check — открой в браузере: http://localhost:3000/health
  if (req.method === "GET" && req.url === "/health") {
    handleHealth(res);
    return;
  }

  // AI endpoint
  if (req.method === "POST" && req.url === "/api/ai/analyze") {
    try {
      await handleAI(req, res);
    } catch (err) {
      console.error("AI error:", err.message);
      json(res, 500, { error: err.message });
    }
    return;
  }

  // Supabase proxy (все остальные маршруты)
  const target = new URL(req.url, SUPABASE_ORIGIN);
  const options = {
    hostname: target.hostname,
    port: 443,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
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
  const info = aiProviderInfo();
  console.log(`\n🚀 JTD Proxy запущен на порту ${PORT}`);
  console.log(`   Провайдер:    ${info.provider}`);
  console.log(`   Ключ:         ${info.keyPresent ? "✓ найден" : "✗ НЕ НАЙДЕН — добавьте в .env"}`);
  console.log(`   Модель fast:  ${info.modelFast}`);
  console.log(`   Модель smart: ${info.modelSmart}`);
  console.log(`\n   Проверка: http://localhost:${PORT}/health\n`);
});
