import { lazy, ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-attempted';
const RECOVERY_COOLDOWN_MS = 10_000;

function canAttemptRecovery() {
  const lastAttempt = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  return !lastAttempt || Date.now() - lastAttempt > RECOVERY_COOLDOWN_MS;
}

async function recoverFromStaleChunk() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.allSettled((regs ?? []).map((reg) => reg.unregister()));
  } catch {
    // Continue with cache cleanup and a cache-busted reload.
  }

  try {
    if ('caches' in window) {
      const names = await window.caches.keys();
      await Promise.allSettled(names.map((name) => window.caches.delete(name)));
    }
  } catch {
    // Reload even if Cache Storage is unavailable.
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_v', Date.now().toString(36));
  window.location.replace(url.toString());
}

/**
 * Обёртка над React.lazy, которая автоматически перезагружает страницу
 * при ошибке загрузки динамического импорта (новый деплой → старые
 * хеши чанков больше не существуют). Защищена от бесконечного цикла
 * через sessionStorage.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Stale-chunk guard: a chunk may resolve "successfully" but with a
      // missing/undefined default export (corrupted or stale build served by
      // a SW/proxy). React.lazy would then throw "Cannot read properties of
      // undefined (reading 'default')" during render — too late for this
      // try/catch. Detect it here and trigger the same reload path.
      if (!mod || (mod as any).default === undefined) {
        throw new Error("Loading chunk failed: missing default export");
      }
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('Loading chunk') ||
        msg.includes('Loading CSS chunk') ||
        /Cannot read propert(y|ies) of undefined \(reading ['"]default['"]\)/i.test(msg);

      if (isChunkError && canAttemptRecovery()) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        void recoverFromStaleChunk();
        // вернём бесконечный промис, чтобы React не показывал ошибку до reload
        return new Promise(() => {}) as any;
      }
      throw err;
    }
  });
}