#!/usr/bin/env node
/**
 * Линтер: предупреждает о прямых проверках `!isConsultant && (...)` /
 * `isConsultant ? ... : ...` в JSX и рекомендует обернуть в <ConsultantGuard>.
 *
 * Цель: единообразное применение правил для consultant и любых будущих
 * категорий внешних пользователей (см. mem://constraints/external-users-default).
 *
 * Запуск:  node scripts/check-consultant-guard.mjs
 *          bun run lint:consultant
 *
 * Возвращает exit code 1 при нарушениях (для CI). Файлы из ALLOWLIST
 * пропускаются — это места, где прямая проверка осознанна (guard,
 * центральный конфиг, useAuth и т.п.).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src/", import.meta.url).pathname;

/** Файлы, в которых прямые проверки isConsultant допустимы. */
const ALLOWLIST = new Set([
  "components/consultant/ConsultantGuard.tsx",
  "lib/consultantRestrictions.ts",
  "hooks/useAuth.tsx",
  // App.tsx — корневой роутер с Navigate guard для блокированных роутов.
  "App.tsx",
]);

/**
 * Паттерны, которые мы считаем «прямыми» проверками.
 * Ключ — regex, значение — человекочитаемое описание.
 */
const PATTERNS = [
  {
    re: /!isConsultant\s*&&/g,
    hint: "Замените `!isConsultant && <X/>` на `<ConsultantGuard area=\"...\">{<X/>}</ConsultantGuard>`.",
  },
  {
    re: /isConsultant\s*\?\s*[^:]+:\s*/g,
    hint: "Замените `isConsultant ? A : B` на `<ConsultantGuard area=\"...\" mode=\"hide\" fallback={A}>{B}</ConsultantGuard>`.",
  },
  {
    re: /\bisConsultant\s*&&/g,
    hint: "Прямые ветки для consultant в JSX лучше выражать через `<ConsultantGuard>` или `useConsultantBlocked()`.",
  },
];

/** Рекурсивный обход директории. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield full;
    }
  }
}

let violations = 0;
const findings = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOWLIST.has(rel)) continue;

  const text = readFileSync(file, "utf8");
  if (!text.includes("isConsultant")) continue;

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    // Пропускаем комментарии и хук-объявления (`const { isConsultant } = ...`).
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (/const\s*\{[^}]*isConsultant[^}]*\}\s*=/.test(line)) return;
    // useEffect-гарды вида `if (isConsultant) return;` — это не JSX, разрешаем.
    if (/^\s*if\s*\(\s*!?isConsultant\s*\)\s*return/.test(line)) return;

    for (const { re, hint } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        violations++;
        findings.push({
          file: `src/${rel}`,
          line: i + 1,
          code: trimmed.slice(0, 140),
          hint,
        });
        break;
      }
    }
  });
}

if (findings.length === 0) {
  console.log("✓ consultant-guard lint: нарушений не найдено.");
  process.exit(0);
}

const RED = "\x1b[31m";
const YEL = "\x1b[33m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";

console.log(`${RED}✗ consultant-guard lint: найдено ${findings.length} нарушений${RST}\n`);
for (const f of findings) {
  console.log(`  ${YEL}${f.file}:${f.line}${RST}`);
  console.log(`    ${DIM}${f.code}${RST}`);
  console.log(`    → ${f.hint}\n`);
}
console.log(
  `Используйте <ConsultantGuard area="..."> из ` +
    `src/components/consultant/ConsultantGuard.tsx.\n` +
    `Список разрешённых area — в src/lib/consultantRestrictions.ts.`,
);
process.exit(1);