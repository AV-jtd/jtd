/**
 * lazyWithRetry — React.lazy с автоматическим retry при ошибке загрузки чанка.
 *
 * После деплоя старые чанки удаляются с CDN. У пользователей с открытой
 * вкладкой dynamic import падает с "Failed to fetch dynamically imported module".
 * Решение: при ошибке добавить cache-buster к URL и перезагрузить один раз.
 */

const RELOAD_KEY = "jtd_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 30_000; // не перезагружать чаще чем раз в 30 сек

export function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory().catch((err: unknown) => {
      const isChunkError =
        err instanceof Error &&
        (err.message.includes("Failed to fetch") ||
          err.message.includes("dynamically imported module") ||
          err.message.includes("Importing a module script failed") ||
          err.name === "ChunkLoadError");

      if (!isChunkError) throw err;

      // Защита от reload loop
      try {
        const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) throw err;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        throw err;
      }

      // Hard reload с cache-buster
      const url = new URL(window.location.href);
      url.searchParams.set("_reload", Date.now().toString(36));
      window.location.replace(url.toString());

      // Промис никогда не зарезолвится — reload уже идёт
      return new Promise(() => {});
    }) as Promise<{ default: T }>,
  );
}
