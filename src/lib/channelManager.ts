import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * LRU cache for Supabase Realtime channels.
 *
 * Problem this solves:
 * - useGroupChat / useComments open one channel per opened thread.
 * - When user clicks through 20 chats, we used to open and tear down channels
 *   on every mount/unmount, OR keep them all open.
 * - With this manager: at most MAX_ACTIVE channels live at once. The least
 *   recently used channel is closed when the cap is exceeded.
 *
 * Each consumer registers itself by `key` (e.g. `task-comments-<id>`) with a
 * `factory` that builds the channel and an `onMessage` callback. The manager
 * also reference-counts subscribers so a channel is only torn down once nobody
 * is actively listening AND it falls out of the LRU window.
 */

const MAX_ACTIVE = 5;

type Entry = {
  key: string;
  channel: RealtimeChannel;
  refs: number;
  // Multiple subscribers can share one channel — fan out events to all of them.
  listeners: Set<() => void>;
};

class ChannelManager {
  private cache = new Map<string, Entry>(); // insertion order = LRU order

  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   * - If the channel already exists, attaches the listener and bumps LRU.
   * - If it doesn't, builds a new one via `factory` and evicts oldest if needed.
   */
  subscribe(
    key: string,
    factory: () => RealtimeChannel,
    onMessage: () => void
  ): () => void {
    let entry = this.cache.get(key);

    if (entry) {
      // Bump to most-recently-used
      this.cache.delete(key);
      this.cache.set(key, entry);
    } else {
      // Evict LRU until we have room
      while (this.cache.size >= MAX_ACTIVE) {
        const oldestKey = this.cache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        const oldest = this.cache.get(oldestKey)!;
        if (oldest.refs > 0) {
          // Don't evict actively-used channels — bump it instead and try next
          this.cache.delete(oldestKey);
          this.cache.set(oldestKey, oldest);
          // If everything is in-use, we have to allow growing past the cap
          if (oldestKey === this.cache.keys().next().value) break;
          continue;
        }
        supabase.removeChannel(oldest.channel);
        this.cache.delete(oldestKey);
      }

      const channel = factory();
      entry = { key, channel, refs: 0, listeners: new Set() };
      this.cache.set(key, entry);
    }

    entry.refs += 1;
    entry.listeners.add(onMessage);

    return () => {
      const e = this.cache.get(key);
      if (!e) return;
      e.listeners.delete(onMessage);
      e.refs = Math.max(0, e.refs - 1);
      // Don't tear down immediately — let LRU eviction handle it so quick
      // remounts (StrictMode, route flips) reuse the existing channel.
    };
  }

  /**
   * Internal helper used by factories to fan an event out to all listeners.
   * Factories should call `manager.notify(key)` from their `.on(...)` callbacks.
   */
  notify(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return;
    entry.listeners.forEach((cb) => cb());
  }

  /** For diagnostics / dev indicator */
  size() {
    return this.cache.size;
  }
}

export const channelManager = new ChannelManager();
