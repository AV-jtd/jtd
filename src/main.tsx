import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Guard: unregister service workers in iframe/preview contexts to avoid stale caches
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
} else {
  // Register PWA with prompt-based updates (no auto-reload)
  import("virtual:pwa-register").then(({ registerSW }) => {
    let updateReady = false;
    const updateSW = registerSW({
      onNeedRefresh() {
        if (updateReady) return;
        updateReady = true;
        // Show a non-intrusive toast — user decides when to update
        const toast = document.createElement("div");
        toast.id = "pwa-update-toast";
        toast.setAttribute("style",
          "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;" +
          "background:hsl(var(--card));color:hsl(var(--card-foreground));" +
          "border:1px solid hsl(var(--border));border-radius:12px;padding:12px 20px;" +
          "display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);" +
          "font-size:13px;font-family:inherit;animation:fade-in 0.3s ease"
        );
        toast.innerHTML = `
          <span>Доступно обновление</span>
          <button id="pwa-update-btn" style="background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:500">Обновить</button>
          <button id="pwa-dismiss-btn" style="background:none;border:none;color:hsl(var(--muted-foreground));cursor:pointer;font-size:16px;padding:2px 6px">✕</button>
        `;
        document.body.appendChild(toast);
        document.getElementById("pwa-update-btn")?.addEventListener("click", () => {
          updateSW(true);
        });
        document.getElementById("pwa-dismiss-btn")?.addEventListener("click", () => {
          toast.remove();
        });
        // Auto-apply update after 5 seconds if user doesn't react
        setTimeout(() => {
          if (document.getElementById("pwa-update-toast")) {
            updateSW(true);
          }
        }, 5000);
      },
      onOfflineReady() {
        // Silent — no notification needed
      },
    });
  }).catch(() => {
    // PWA registration not available — ignore
  });
}

// Check for new version and force-reload if stale (production only)
import("@/lib/versionCheck").then(({ checkForUpdates }) => checkForUpdates()).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
