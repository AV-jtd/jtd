import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "prompt",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "placeholder.svg", "pwa-maskable-192x192.png", "pwa-maskable-512x512.png", "offline.html"],
      workbox: {
        skipWaiting: false,
        clientsClaim: false,
        // Automatically delete precache entries from previous SW versions
        // on activation. Combined with the orphan-cache cleanup in
        // custom-sw.js, this prevents unbounded cache growth on mobile.
        cleanupOutdatedCaches: true,
        // Stamp the precache name with the build version so each deploy
        // produces a fresh precache and the previous one is purged.
        cacheId: `jtd-${buildVersion}`,
        // Offline fallback: if a navigation request fails (no network and
        // not in cache — e.g. first launch offline of a deep link), serve
        // the precached /offline.html instead of a browser network error.
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /\.[a-z0-9]+$/i],
        // Keep only the critical app shell in precache.
        // Heavy/lazy chunks (xlsx, pdf, Protocol/NPD/Gantt/Dashboard, etc.) are
        // served via runtime caching on first use — this drops the initial PWA
        // download from ~5 MB to a small shell, dramatically improving cold
        // start on mobile networks.
        // Allow the main app bundle (~2.2 MB) but exclude heavy lazy chunks via globIgnores.
        maximumFileSizeToCacheInBytes: 2.5 * 1024 * 1024,
        globPatterns: ["**/*.{html,css,ico,svg,webmanifest}", "assets/index-*.js"],
        globIgnores: [
          "**/node_modules/**",
          "assets/xlsx-*.js",
          "assets/pdf-*.js",
          "assets/purify*.js",
          "assets/index.es-*.js",
          "assets/ProtocolDetail-*.js",
          "assets/Npd-*.js",
          "assets/GanttView-*.js",
          "assets/DashboardView-*.js",
          "assets/Crm-*.js",
          "assets/StmMatrix-*.js",
          "assets/Pmo-*.js",
          "assets/Settings-*.js",
          "assets/Protocols-*.js",
          "assets/NpdSwimlaneMatrix-*.js",
          "assets/ProjectChat-*.js",
        ],
        importScripts: [`/custom-sw.js?v=${buildVersion}`],
        runtimeCaching: [
          {
            // Lazy-loaded JS/CSS chunks — cache on first use, serve instantly after.
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: "StaleWhileRevalidate",
            options: {
              // Versioned name → previous deploy's runtime cache becomes
              // orphaned and is removed by the activate handler in custom-sw.js.
              cacheName: `app-chunks-${buildVersion}`,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Images served from same origin (icons, placeholders, uploads).
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: `app-images-${buildVersion}`,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: "JustTODOit — менеджер задач",
        short_name: "JustTODOit",
        description: "Управляйте задачами, проектами и тегами",
        theme_color: "#5c3d2e",
        background_color: "#5c3d2e",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
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

          // React core — needed on every page, keep together for cache hit.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/react-router") ||
            id.includes("/react-router-dom/")
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

          // Everything else from node_modules → generic vendor bucket.
          return "vendor-misc";
        },
      },
    },
  },
}));
