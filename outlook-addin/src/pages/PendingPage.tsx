import { useState } from "react";
import type { PromisesReport } from "../lib/types";
import { getEmailsSince } from "../lib/db";
import { findPromises } from "../lib/ai";
import { groupByConversation } from "../lib/utils";
import { Spinner } from "../components/Spinner";
import { Badge } from "../components/Badge";

const urgencyVariant = { low: "default", medium: "warning", high: "danger" } as const;

export function PendingPage() {
  const [report, setReport] = useState<PromisesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const emails = await getEmailsSince(days);
      if (emails.length === 0) {
        setError("Нет писем за выбранный период. Сначала синхронизируй базу на вкладке «Разбор».");
        return;
      }
      // Берём ветки с 2+ письмами — там живут обещания
      const threads = groupByConversation(emails)
        .filter((t) => t.emails.length >= 2)
        .slice(0, 15);
      if (threads.length === 0) {
        setError("Не нашлось переписок с двумя и более письмами за период.");
        return;
      }
      setReport(await findPromises(threads));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка анализа");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">ИИ ищет невыполненные обещания...</p>
        <p className="text-xs text-gray-400">Анализ займёт до минуты</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
        <div className="text-4xl">⏳</div>
        <p className="text-sm font-medium text-gray-700">Что зависло?</p>
        <p className="max-w-56 text-xs text-gray-400">
          ИИ найдёт обещания без выполнения («пришлю на этой неделе» месяц назад)
          и вопросы без ответов
        </p>
        <div className="flex gap-1">
          {[14, 30, 60].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 text-xs ${
                days === d ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {d} дней
            </button>
          ))}
        </div>
        <button
          onClick={handleAnalyze}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Найти зависшее
        </button>
        {error && <p className="max-w-60 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
          ✨ Вывод
        </p>
        <p className="text-sm leading-relaxed text-gray-700">{report.summary}</p>
      </div>

      {report.openPromises?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            🤝 Невыполненные обещания
          </p>
          <div className="space-y-2">
            {report.openPromises.map((p, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{p.from}</p>
                  <Badge variant={urgencyVariant[p.urgency] || "default"}>
                    {p.daysSince} дн.
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-gray-700">{p.promise}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Обещано: {p.promisedDate} · {p.subject}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.openQuestions?.length > 0 && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            ❓ Вопросы без ответа
          </p>
          <div className="space-y-2">
            {report.openQuestions.map((q, i) => (
              <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700">{q.question}</p>
                  <Badge variant="warning">{q.daysSince} дн.</Badge>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {q.askedBy} → {q.to} · {q.subject}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setReport(null)}
        className="w-full rounded-lg border border-gray-200 py-2 text-sm text-gray-500 hover:bg-gray-50"
      >
        Новый анализ
      </button>
    </div>
  );
}
