import { useEffect, useState } from "react";
import type { Category, EmailItem, SyncState } from "../lib/types";
import { getAllEmails, deleteEmails, putEmails } from "../lib/db";
import { getSyncState, runSync, cancelSync, resetSync } from "../lib/sync";
import { categoriseEmails } from "../lib/ai";
import { moveToTrash, moveToArchive, markAsRead } from "../lib/ews";
import { Spinner } from "../components/Spinner";
import { Badge } from "../components/Badge";
import { formatDateFull } from "../lib/utils";

const CATEGORY_META: Record<Category, { label: string; icon: string; desc: string }> = {
  action:     { label: "Требует ответа", icon: "🔴", desc: "нужно ответить или сделать" },
  info:       { label: "К сведению",     icon: "🟡", desc: "прочитать, ответ не нужен" },
  newsletter: { label: "Рассылки",       icon: "📰", desc: "новости, маркетинг" },
  auto:       { label: "Авто-уведомления", icon: "🤖", desc: "системы, сервисы" },
  trash:      { label: "Мусор",          icon: "🗑", desc: "спам и ненужное" },
};

type BulkAction = "trash" | "archive" | "read";

export function TriagePage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [catProgress, setCatProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<Category | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ cat: Category; action: BulkAction } | null>(null);

  async function reload() {
    setEmails(await getAllEmails());
    setSync(await getSyncState());
  }

  useEffect(() => {
    reload();
  }, []);

  // ── Синхронизация ──
  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await runSync((s) => setSync({ ...s }));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  }

  function handleCancelSync() {
    cancelSync();
    setSyncing(false);
  }

  async function handleResetSync() {
    await resetSync();
    await reload();
  }

  // ── Категоризация ──
  const uncategorised = emails.filter((e) => !e.category);

  async function handleCategorise() {
    setError(null);
    setCatProgress({ done: 0, total: uncategorised.length });
    try {
      await categoriseEmails(uncategorised, (done, total) =>
        setCatProgress({ done, total })
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка категоризации");
    } finally {
      setCatProgress(null);
    }
  }

  // ── Массовые действия ──
  async function executeBulk(cat: Category, action: BulkAction) {
    setConfirmAction(null);
    const targets = emails.filter((e) => e.category === cat);
    if (targets.length === 0) return;

    setBusy(`${CATEGORY_META[cat].label}: выполняем...`);
    setError(null);
    try {
      const CHUNK = 25;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        setBusy(`${CATEGORY_META[cat].label}: ${i + chunk.length} из ${targets.length}`);
        if (action === "trash") {
          await moveToTrash(chunk.map((e) => e.id));
          await deleteEmails(chunk.map((e) => e.id));
        } else if (action === "archive") {
          await moveToArchive(chunk.map((e) => e.id));
          await deleteEmails(chunk.map((e) => e.id));
        } else {
          await markAsRead(chunk.map((e) => ({ id: e.id, changeKey: e.changeKey })));
          await putEmails(chunk.map((e) => ({ ...e, isRead: true })));
        }
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка операции");
      await reload();
    } finally {
      setBusy(null);
    }
  }

  // ── Подсчёты ──
  const unread = emails.filter((e) => !e.isRead);
  const byCategory = new Map<Category, EmailItem[]>();
  for (const e of emails) {
    if (!e.category) continue;
    const arr = byCategory.get(e.category) || [];
    arr.push(e);
    byCategory.set(e.category, arr);
  }

  const syncPhaseLabel =
    sync?.phase === "unread" ? "непрочитанные" : sync?.phase === "all" ? "все письма" : "";

  return (
    <div className="space-y-3 p-3">
      {/* ── Блок синхронизации ── */}
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">База писем</p>
            <p className="text-xs text-gray-400">
              {emails.length} в базе · {unread.length} непрочитанных
              {sync?.lastSyncDate && ` · синхр. ${formatDateFull(sync.lastSyncDate)}`}
            </p>
          </div>
          {!syncing ? (
            <div className="flex gap-1">
              <button
                onClick={handleSync}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
              >
                {sync?.phase === "done" ? "Обновить" : sync?.phase === "idle" ? "Синхронизировать" : "Продолжить"}
              </button>
              {sync && sync.phase !== "idle" && (
                <button
                  onClick={handleResetSync}
                  className="rounded-lg border px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                  title="Начать синхронизацию заново"
                >
                  ↺
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleCancelSync}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50"
            >
              Пауза
            </button>
          )}
        </div>

        {syncing && sync && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Загружаем: {syncPhaseLabel}</span>
              <span>
                {sync.offset} из {sync.totalEstimate || "?"}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{
                  width: sync.totalEstimate
                    ? `${Math.min(100, (sync.offset / sync.totalEstimate) * 100)}%`
                    : "10%",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Категоризация ── */}
      {emails.length > 0 && uncategorised.length > 0 && !catProgress && (
        <button
          onClick={handleCategorise}
          className="w-full rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm font-medium text-brand-600 hover:bg-brand-100 transition-colors"
        >
          ✨ Категоризировать {uncategorised.length} писем с ИИ
        </button>
      )}

      {catProgress && (
        <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Spinner size="sm" />
            <span>
              ИИ сортирует: {catProgress.done} из {catProgress.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className="h-full bg-brand-500 transition-all"
              style={{ width: `${(catProgress.done / Math.max(1, catProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
          <Spinner size="sm" />
          {busy}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</div>
      )}

      {/* ── Категории ── */}
      {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
        const items = byCategory.get(cat) || [];
        if (items.length === 0) return null;
        const meta = CATEGORY_META[cat];
        const isOpen = openCategory === cat;

        return (
          <div key={cat} className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <button
              onClick={() => setOpenCategory(isOpen ? null : cat)}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{meta.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                  <p className="text-xs text-gray-400">{meta.desc}</p>
                </div>
              </div>
              <Badge variant={cat === "action" ? "danger" : cat === "trash" ? "default" : "info"}>
                {items.length}
              </Badge>
            </button>

            {isOpen && (
              <div className="border-t bg-gray-50 p-3 space-y-2">
                {/* Действия с категорией */}
                <div className="flex flex-wrap gap-1.5">
                  {confirmAction?.cat === cat ? (
                    <div className="flex w-full items-center justify-between rounded-md bg-red-50 px-2 py-1.5">
                      <span className="text-xs text-red-600">
                        {confirmAction.action === "trash"
                          ? `Удалить ${items.length} писем в корзину?`
                          : confirmAction.action === "archive"
                          ? `Переместить ${items.length} писем в Архив?`
                          : `Отметить ${items.length} прочитанными?`}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => executeBulk(cat, confirmAction.action)}
                          className="rounded bg-red-500 px-2 py-0.5 text-xs text-white"
                        >
                          Да
                        </button>
                        <button
                          onClick={() => setConfirmAction(null)}
                          className="rounded border px-2 py-0.5 text-xs text-gray-500"
                        >
                          Нет
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setConfirmAction({ cat, action: "trash" })}
                        className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                      >
                        🗑 В корзину
                      </button>
                      <button
                        onClick={() => setConfirmAction({ cat, action: "archive" })}
                        className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        📦 В архив
                      </button>
                      <button
                        onClick={() => setConfirmAction({ cat, action: "read" })}
                        className="rounded-md border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        ✓ Прочитано
                      </button>
                    </>
                  )}
                </div>

                {/* Список писем (первые 30) */}
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {items.slice(0, 30).map((e) => (
                    <div key={e.id} className="rounded border bg-white p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-gray-700">{e.subject}</p>
                        {e.aiPriority === "high" && <Badge variant="danger">!</Badge>}
                      </div>
                      <p className="truncate text-xs text-gray-400">
                        {e.fromName || e.from} {e.gist && `— ${e.gist}`}
                      </p>
                    </div>
                  ))}
                  {items.length > 30 && (
                    <p className="py-1 text-center text-xs text-gray-400">
                      ...и ещё {items.length - 30}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {emails.length === 0 && !syncing && (
        <div className="py-8 text-center text-sm text-gray-400">
          Нажми «Синхронизировать», чтобы загрузить письма из Outlook
        </div>
      )}
    </div>
  );
}
