import { useState } from "react";
import type { DaySummary, EmailItem } from "../lib/types";
import { fetchTodayEmails } from "../lib/ews";
import { buildDaySummary } from "../lib/ai";
import { Spinner } from "../components/Spinner";
import { Badge } from "../components/Badge";

export function DaySummaryPage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "emails" | "ai" | "done">("idle");

  async function handleBuild() {
    setError(null);
    setStep("emails");
    setLoadingEmails(true);
    try {
      const fetched = await fetchTodayEmails(200);
      setEmails(fetched);
      setStep("ai");
      setLoadingEmails(false);
      setLoadingAi(true);
      const result = await buildDaySummary(fetched);
      setSummary(result);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setStep("idle");
    } finally {
      setLoadingEmails(false);
      setLoadingAi(false);
    }
  }

  if (step === "idle" && !summary) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-4xl">📬</div>
        <p className="text-sm text-gray-500 text-center max-w-48">
          Загрузим все письма за сегодня и составим умный дайджест
        </p>
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

  if (loadingEmails) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Загружаем письма из Exchange...</p>
      </div>
    );
  }

  if (loadingAi) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">
          ИИ анализирует {emails.length} писем...
        </p>
        <p className="text-xs text-gray-400">Это займёт 15–30 секунд</p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="space-y-3 p-3">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-brand-600">{summary.totalEmails}</div>
          <div className="text-xs text-gray-500">писем сегодня</div>
        </div>
        <div className="rounded-lg border bg-white p-3 text-center shadow-sm">
          <div className="text-2xl font-bold text-orange-500">{summary.unreadCount}</div>
          <div className="text-xs text-gray-500">непрочитанных</div>
        </div>
      </div>

      {/* Overall insight */}
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
        <p className="text-xs font-medium text-brand-600 uppercase tracking-wide mb-1.5">✨ Общий вывод</p>
        <p className="text-sm text-gray-700 leading-relaxed">{summary.overallInsight}</p>
      </div>

      {/* Action items */}
      {summary.actionItems?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            → Нужно сделать
          </p>
          <ul className="space-y-1">
            {summary.actionItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-orange-400 shrink-0">□</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top threads */}
      {summary.topThreads?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Активные переписки
          </p>
          <div className="space-y-2">
            {summary.topThreads.map((t, i) => (
              <div key={i} className="border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 leading-snug">{t.subject}</p>
                  <Badge variant="info" className="shrink-0">
                    {t.count}
                  </Badge>
                </div>
                {t.insight && (
                  <p className="mt-0.5 text-xs text-gray-500">{t.insight}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top people */}
      {summary.topPeople?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
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

      {/* By project */}
      {summary.byProject?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            По проектам / темам
          </p>
          <div className="space-y-2">
            {summary.byProject.map((pr, i) => (
              <div key={i} className="border-b last:border-0 pb-2 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{pr.project}</span>
                  <Badge variant="default">{pr.count}</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{pr.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleBuild}
        className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
      >
        Обновить
      </button>
    </div>
  );
}
