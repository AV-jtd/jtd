// Сборка edge-функции `assistant-tools` из src/lib/assistant/edge.ts.
//
// Зачем свой скрипт. Функцию коннектора собирает плагин @lovable.dev/mcp-js: он
// берёт src/lib/mcp/index.ts, инлайнит локальный код и переписывает импорты
// пакетов в npm:-спецификаторы, которые понимает Deno. Для второго входа
// (ассистент внутри приложения) плагина нет, а руками держать копию 33
// инструментов в папке функций нельзя — копия разойдётся с оригиналом на первой
// же правке. Поэтому тот же приём своими руками: esbuild инлайнит локальный код,
// внешние пакеты остаются npm:-импортами с версиями из package.json.
//
// Запускается из npm run build, значит артефакт обновляется на каждой сборке —
// и deploy.sh выкатывает его вместе с фронтендом, ничего не зная про него
// отдельно.

import { build } from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ENTRY = resolve(ROOT, "src/lib/assistant/edge.ts");
const OUT = resolve(ROOT, "supabase/functions/assistant-tools/index.ts");

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const versions = { ...pkg.devDependencies, ...pkg.dependencies };

/** Имя пакета из спецификатора: "@scope/pkg/sub" → "@scope/pkg". */
const packageOf = (spec) =>
  spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

const denoExternals = {
  name: "deno-externals",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (args) => {
      const p = args.path;
      // Локальные файлы и алиас @/ инлайним.
      if (p.startsWith(".") || p.startsWith("/")) return null;
      if (p.startsWith("@/")) return { path: resolve(ROOT, "src", p.slice(2)) };
      // node:* Deno понимает как есть.
      if (p.startsWith("node:") || p.startsWith("npm:")) return { path: p, external: true };
      const name = packageOf(p);
      const version = versions[name];
      if (!version) {
        throw new Error(
          `Пакет ${name} импортируется в функции, но его нет в package.json — версию в npm:-спецификатор подставить нечем.`,
        );
      }
      return { path: `npm:${p}@${version}`, external: true };
    });
  },
};

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  // Функция запускается в Deno, где import.meta.env нет: значения подставляем
  // на сборке, как это делает Vite для функции коннектора.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL ?? "https://justtodoit.ru"),
    "import.meta.env.VITE_SUPABASE_PROXY_URL": JSON.stringify(
      process.env.VITE_SUPABASE_PROXY_URL ?? "https://justtodoit.ru/sb",
    ),
  },
  plugins: [denoExternals],
  logLevel: "warning",
});

const banner = [
  "// СОБРАНО скриптом scripts/build-assistant-function.mjs — руками не править.",
  "// Источник: src/lib/assistant/edge.ts и общий реестр src/lib/mcp/registry.ts.",
  "// Пересобирается на каждом npm run build.",
  "",
].join("\n");

const code = banner + result.outputFiles[0].text;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, code, "utf8");

// Пустой артефакт — это молча сломанная функция, поэтому проверяем сразу.
if (!code.includes("catalog") || code.length < 5000) {
  throw new Error(`Артефакт ${OUT} подозрительно мал (${code.length} байт) — сборка неполная.`);
}
console.log(`assistant-tools: ${(code.length / 1024).toFixed(0)} КБ → supabase/functions/assistant-tools/index.ts`);
