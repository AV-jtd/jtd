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
      registerType: "prompt",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "placeholder.svg", "pwa-maskable-192x192.png", "pwa-maskable-512x512.png"],
      workbox: {
      skipWaiting: true,
      clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/~oauth/],
        importScripts: ["/custom-sw.js"],
        runtimeCaching: [
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
