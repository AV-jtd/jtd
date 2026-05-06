import { lazy, ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-attempted';

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

      if (isChunkError && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        // вернём бесконечный промис, чтобы React не показывал ошибку до reload
        return new Promise(() => {}) as any;
      }
      throw err;
    }
  });
}