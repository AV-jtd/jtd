import type { EmailItem, SyncState } from "./types";
import { findInboxPage, getBodies } from "./ews";
import { putEmails, getMeta, setMeta, countEmails } from "./db";

const PAGE_SIZE = 50;
const BODY_BATCH = 10;
const SYNC_KEY = "sync_state";

export type ProgressCallback = (state: SyncState) => void;

const defaultState: SyncState = {
  phase: "idle",
  offset: 0,
  totalEstimate: 0,
  loaded: 0,
  lastSyncDate: null,
};

export async function getSyncState(): Promise<SyncState> {
  return (await getMeta<SyncState>(SYNC_KEY)) || { ...defaultState };
}

async function saveState(state: SyncState): Promise<void> {
  await setMeta(SYNC_KEY, state);
}

let cancelRequested = false;

export function cancelSync(): void {
  cancelRequested = true;
}

/**
 * Возобновляемая синхронизация.
 * Фаза 1: непрочитанные. Фаза 2: все письма.
 */
export async function runSync(onProgress: ProgressCallback): Promise<SyncState> {
  cancelRequested = false;
  let state = await getSyncState();

  if (state.phase === "idle" || state.phase === "done") {
    state = { ...defaultState, phase: "unread", loaded: await countEmails() };
  }

  while (!cancelRequested) {
    const unreadOnly = state.phase === "unread";
    const page = await findInboxPage(state.offset, PAGE_SIZE, unreadOnly);

    state.totalEstimate = page.totalCount;

    if (page.emails.length > 0) {
      // Тела батчами
      const withBodies: EmailItem[] = [];
      for (let i = 0; i < page.emails.length; i += BODY_BATCH) {
        if (cancelRequested) break;
        const batch = page.emails.slice(i, i + BODY_BATCH);
        let bodies = new Map<string, string>();
        try {
          bodies = await getBodies(batch.map((e) => e.id));
        } catch {
          // Письмо без тела — не критично, продолжаем
        }
        for (const e of batch) {
          withBodies.push({ ...e, body: bodies.get(e.id) || "" });
        }
      }

      await putEmails(withBodies);
      state.loaded += withBodies.length;
      state.offset += page.emails.length;
      await saveState(state);
      onProgress({ ...state });
    }

    if (page.includesLastItem || page.emails.length === 0) {
      if (state.phase === "unread") {
        // Переходим ко всем письмам
        state.phase = "all";
        state.offset = 0;
        await saveState(state);
        onProgress({ ...state });
      } else {
        state.phase = "done";
        state.lastSyncDate = new Date().toISOString();
        await saveState(state);
        onProgress({ ...state });
        break;
      }
    }
  }

  if (cancelRequested) {
    await saveState(state);
  }
  return state;
}

export async function resetSync(): Promise<void> {
  await saveState({ ...defaultState });
}
