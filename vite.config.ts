import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

/** Writes version.json into the build output so the app can detect stale caches */
function versionJsonPlugin(version: string): Plugin {
  return {
    name: "version-json",
    writeBundle({ dir }) {
      const outDir = dir || "dist";
      fs.writeFileSync(
        path.resolve(outDir, "version.json"),
        JSON.stringify({ version }),
      );
    },
  };
}

// https://vitejs.dev/config/
const buildVersion = Date.now().toString(36);

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_BUILD_VERSION": JSON.stringify(buildVersion),
  },
  // Expose build version to the custom service worker via a generated module.
  // The custom-sw.js reads `self.__APP_VERSION__` to derive cache names.
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && versionJsonPlugin(buildVersion),
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase warning limit so we don't see noise for legitimately large
    // page chunks (e.g. ProtocolDetail, exceljs, xlsx already split).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Manual vendor chunking — splits the 1.16 MB main bundle into
        // logical groups so the initial mobile load only fetches what's
        // needed for the first paint. Heavier groups (charts, dnd, editor)
        // are loaded lazily by the routes that actually use them.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // Heavy libraries that are ALREADY dynamically imported by feature
          // code (xlsx, exceljs, pdf, dompurify, etc.) — let Rollup keep them
          // in their own lazy chunks instead of pulling them into vendor-misc.
          if (
            id.includes("/xlsx/") ||
            id.includes("/exceljs/") ||
            id.includes("/jspdf/") ||
            id.includes("/jspdf-autotable/") ||
            id.includes("/pdfjs-") ||
            id.includes("/html2canvas/") ||
            id.includes("/dompurify/") ||
            id.includes("/file-saver/") ||
            id.includes("/pptxgenjs/") ||
            id.includes("/mammoth/")
          ) {
            return undefined;
          }

          // React core + EVERYTHING that depends on the React runtime must
          // live in the same chunk. Otherwise sibling vendor chunks that
          // use React.createContext/useState load before this one and crash
          // the whole bundle with "Cannot read properties of undefined
          // (reading 'createContext')". Keep this list permissive — it is
          // safer to over-include than to split React across chunks.
          if (
            // Core React runtime
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/") ||
            id.includes("/node_modules/react-is/") ||
            id.includes("/node_modules/use-sync-external-store/") ||
            id.includes("/node_modules/react-fast-compare/") ||
            // Routing
            id.includes("/node_modules/react-router") ||
            id.includes("/node_modules/@remix-run/router/") ||
            id.includes("/node_modules/history/")
          ) {
            return "vendor-react";
          }

          // Supabase client — used on every page, keep separate from react.
          if (id.includes("@supabase/")) {
            return "vendor-supabase";
          }

          // TanStack Query — used everywhere, but stable.
          if (id.includes("@tanstack/")) {
            return "vendor-query";
          }

          // Radix UI primitives — heavy, but used across many pages.
          if (id.includes("@radix-ui/")) {
            return "vendor-radix";
          }

          // Lucide icons — large set, used widely.
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          // Date utilities.
          if (id.includes("date-fns")) {
            return "vendor-date";
          }

          // Drag-and-drop — only sidebar/board pages.
          if (id.includes("@dnd-kit/") || id.includes("react-beautiful-dnd")) {
            return "vendor-dnd";
          }

          // Charts — only dashboard/PMO/reports.
          if (id.includes("recharts") || id.includes("d3-")) {
            return "vendor-charts";
          }

          // Rich-text editor — only Wiki.
          if (id.includes("@tiptap/") || id.includes("prosemirror")) {
            return "vendor-editor";
          }

          // Animation library — used in several places.
          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }

          // Form handling.
          if (id.includes("react-hook-form") || id.includes("@hookform/") || id.includes("zod")) {
            return "vendor-forms";
          }

          // Everything else from node_modules → leave un-chunked so Rollup
          // can hoist it next to the dependent chunk. Forcing a single
          // "vendor-misc" bucket previously pulled React-using libraries
          // (e.g. react-helmet-async, react-day-picker) into a chunk that
          // loaded before vendor-react and crashed the app with
          // "createContext of undefined".
          return undefined;
        },
      },
    },
  },
}));
