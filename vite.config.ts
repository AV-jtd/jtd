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
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "placeholder.svg", "pwa-maskable-192x192.png", "pwa-maskable-512x512.png"],
      workbox: {
      skipWaiting: true,
      clientsClaim: true,
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
        navigateFallbackDenylist: [/^\/~oauth/],
        importScripts: ["/custom-sw.js"],
        runtimeCaching: [
          {
            // Lazy-loaded JS/CSS chunks — cache on first use, serve instantly after.
            urlPattern: /\/assets\/.*\.(?:js|css)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-chunks",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Images served from same origin (icons, placeholders, uploads).
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "app-images",
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
}));
