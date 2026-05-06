#!/usr/bin/env node
/**
 * Генерирует ANON_KEY и SERVICE_ROLE_KEY для Supabase self-hosted.
 * Запуск: node self-hosting/generate-keys.js <JWT_SECRET>
 *
 * Пример:
 *   node self-hosting/generate-keys.js "мой_jwt_секрет_32_символа_минимум"
 */

const secret = process.argv[2];
if (!secret) {
  console.error("Использование: node generate-keys.js <JWT_SECRET>");
  process.exit(1);
}

function base64url(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sign(payload, secret) {
  const crypto = require("crypto");
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  return `${header}.${body}.${sig}`;
}

const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 3600; // 10 лет

const anonKey = sign({ role: "anon", iss: "supabase", iat: now, exp }, secret);
const serviceKey = sign({ role: "service_role", iss: "supabase", iat: now, exp }, secret);

console.log("\nАНОН КЛЮЧ (ANON_KEY):");
console.log(anonKey);
console.log("\nСЕРВИСНЫЙ КЛЮЧ (SERVICE_ROLE_KEY):");
console.log(serviceKey);
console.log("\nВставь эти значения в .env.supabase");
