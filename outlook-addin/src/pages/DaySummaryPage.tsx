import { useState } from "react";
import type { DaySummary } from "../lib/types";
import { getToday, stats } from "../lib/store";
import { buildDaySummary } from "../lib/ai";
import { Spinner } from "../components/Spinner";
import { Badge } from "../components/Badge";

export function DaySummaryPage({ storeVersion }: { storeVersion: number }) {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeStats = stats();
  const todayEmails = getToday();

  async function handleBuild() {
    if (todayEmails.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      setSummary(await buildDaySummary(todayEmails));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (todayEmails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
        <div className="text-4xl">📬</div>
        <p className="text-sm font-medium text-gray-700">Писем за сегодня пока нет</p>
        <p className="text-xs text-gray-400 max-w-52">
          Откройте несколько писем в Outlook — аддин автоматически их запомнит.
          Всего в архиве: {storeStats.total} писем.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">
          ИИ анализирует {todayEmails.length} писем...
        </p>
        <p className="text-xs text-gray-400">Займёт 15–30 секунд</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 px-4">
        <div className="text-4xl">📅</div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            {todayEmails.length} писем за сегодня
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Всего в архиве: {storeStats.total}
          </p>
        </div>
        <button
          onClick={handleBuild}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
        >
          Создать дайджест дня
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-brand-600">{summary.totalEmails}</div>
          <div className="text-xs text-gray-500">писем сегодня</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-500">{summary.unreadCount}</div>
          <div className="text-xs text-gray-500">требуют внимания</div>
        </div>
      </div>

      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-brand-600">
          ✨ Общий вывод
        </p>
        <p className="text-sm leading-relaxed text-gray-700">{summary.overallInsight}</p>
      </div>

      {summary.actionItems?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            → Нужно сделать
          </p>
          <ul className="space-y-1">
            {summary.actionItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="shrink-0 text-orange-400">□</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.topThreads?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Активные переписки
          </p>
          <div className="space-y-2">
            {summary.topThreads.map((t, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-gray-800">{t.subject}</p>
                  <Badge variant="info" className="shrink-0">{t.count}</Badge>
                </div>
                {t.insight && <p className="mt-0.5 text-xs text-gray-500">{t.insight}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.topPeople?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Активные участники
          </p>
          <div className="space-y-1.5">
            {summary.topPeople.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{p.name}</span>
                <Badge variant="default">{p.count} писем</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.byProject?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            По проектам / темам
          </p>
          <div className="space-y-2">
            {summary.byProject.map((pr, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{pr.project}</span>
                  <Badge variant="default">{pr.count}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{pr.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleBuild}
        className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
      >
        Обновить анализ
      </button>
    </div>
  );
}
