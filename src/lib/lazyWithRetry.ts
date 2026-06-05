import { lazy, ComponentType } from 'react';
import { canAttemptRecovery, recoverFromStaleChunk, isStaleChunkError } from './chunkRecovery';

/**
 * Обёртка над React.lazy, которая автоматически перезагружает страницу
 * при ошибке загрузки динамического импорта (новый деплой → старые
 * хеши чанков больше не существуют). Защищена от бесконечного цикла
 * через общий счётчик попыток (см. chunkRecovery.ts) — раньше сброс
 * флага на каждом успешном чанке приводил к ERR_TOO_MANY_REDIRECTS.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Stale-chunk guard: a chunk may resolve "successfully" but with a
      // missing/undefined default export (corrupted or stale build served by
      // a SW/proxy). React.lazy would then throw during render — too late for
      // this try/catch. Detect it here and trigger the same reload path.
      if (!mod || (mod as { default?: unknown }).default === undefined) {
        throw new Error("Loading chunk failed: missing default export");
      }
      return mod;
    } catch (err) {
      if (isStaleChunkError(err) && canAttemptRecovery()) {
        void recoverFromStaleChunk();
        // вернём бесконечный промис, чтобы React не показывал ошибку до reload
        return new Promise(() => {}) as never;
      }
      throw err;
    }
  });
}
