// ---------------------------------------------------------------------------
// localStorage / sessionStorage safety shim
// ---------------------------------------------------------------------------
// Safari Private Mode (and some locked-down browsers) throw QuotaExceededError
// the moment anything tries to write to localStorage. The Supabase auth client,
// our theme provider, and many other modules call localStorage during import,
// which crashes the entire bundle BEFORE React even mounts → user sees a
// permanent white screen on Mac Safari/Chrome.
//
// We patch the storage APIs with an in-memory fallback if a probe write fails,
// so the app degrades gracefully (sessions are not persisted across reloads,
// but the app still loads).
(function installStorageShim() {
  const probe = "__jtd_storage_probe__";
  function safeWrap(name: "localStorage" | "sessionStorage") {
    try {
      const s = window[name];
      s.setItem(probe, "1");
      s.removeItem(probe);
      return; // works fine
    } catch {
      const memory = new Map<string, string>();
      const shim: Storage = {
        get length() { return memory.size; },
        clear() { memory.clear(); },
        getItem(k) { return memory.has(k) ? memory.get(k)! : null; },
        key(i) { return Array.from(memory.keys())[i] ?? null; },
        removeItem(k) { memory.delete(k); },
        setItem(k, v) { memory.set(k, String(v)); },
      };
      try {
        Object.defineProperty(window, name, { value: shim, configurable: true });
      } catch {
        // Last resort — patch individual methods.
        try {
          (window[name] as any).setItem = shim.setItem.bind(shim);
          (window[name] as any).getItem = shim.getItem.bind(shim);
          (window[name] as any).removeItem = shim.removeItem.bind(shim);
        } catch {}
      }
      console.warn(`[Boot] ${name} unavailable — using in-memory fallback (Safari Private Mode?)`);
    }
  }
  safeWrap("localStorage");
  safeWrap("sessionStorage");
})();

import { createRoot } from "react-dom/client";
import "./lib/authRefreshSingleflight";
import App from "./App.tsx";
import "./index.css";

// Emergency offline reset: production PWA/offline caching is disabled for now.
// Several users got a "zombie" shell from stale SW/IndexedDB caches: UI loaded,
// but fresh auth/data requests never completed. Always start from network and
// keep only auth/local UI state.
void (async () => {
  try {
    const killRegistration = await navigator.serviceWorker?.register("/sw.js", { updateViaCache: "none" });
    await killRegistration?.update?.();
  } catch (err) {
    console.warn("[Boot] service worker kill registration failed:", err);
  }

  try {
    await navigator.serviceWorker?.getRegistrations().then((regs) =>
      Promise.all(regs.map((r) => r.unregister())),
    );
  } catch (err) {
    console.warn("[Boot] service worker cleanup failed:", err);
  }

  try {
    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
    }
  } catch (err) {
    console.warn("[Boot] cache cleanup failed:", err);
  }

  try {
    if ("indexedDB" in window) {
      window.indexedDB.deleteDatabase("keyval-store");
      window.indexedDB.deleteDatabase("workbox-expiration");
    }
  } catch (err) {
    console.warn("[Boot] IndexedDB cleanup failed:", err);
  }
})();

// Global last-resort error visible UI: if anything throws synchronously during
// app boot (a vendor chunk, a top-level module, etc.) the user otherwise sees
// only a white screen with no way to recover. This shows a minimal error card
// with a reload button so they can at least retry.
function showBootError(err: unknown) {
  console.error("[Boot] Fatal app boot error:", err);
  const root = document.getElementById("root");
  if (!root) return;
  const message = err instanceof Error ? err.message : String(err);
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#f1f5f9;">
      <div style="max-width:480px;text-align:center;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;">Не удалось запустить приложение</h1>
        <p style="font-size:14px;opacity:0.8;margin:0 0 16px;">Попробуйте обновить страницу. Если ошибка повторится — очистите кэш браузера для этого сайта.</p>
        <pre style="font-size:11px;opacity:0.6;text-align:left;background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;overflow:auto;max-height:200px;">${message.replace(/[<>&]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]!))}</pre>
        <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;">Перезагрузить</button>
      </div>
    </div>
  `;
}

window.addEventListener("error", (e) => {
  // Only react to errors before React has mounted anything visible.
  const root = document.getElementById("root");
  if (root && root.children.length === 0) showBootError(e.error || e.message);
});

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (err) {
  showBootError(err);
}
