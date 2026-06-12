import { useState } from "react";
import type { AiAnalysis, EmailItem, Thread } from "../lib/types";
import { fetchTodayEmails } from "../lib/ews";
import { analyzeThread } from "../lib/ai";
import { groupByConversation, formatDate } from "../lib/utils";
import { AiBlock } from "../components/AiBlock";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";

function ThreadCard({
  thread,
}: {
  thread: Thread;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeThread(thread);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {thread.unreadCount > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
              )}
              <p className="text-sm font-medium text-gray-800 truncate">{thread.subject}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {thread.participants.slice(0, 3).join(", ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="info">{thread.emails.length}</Badge>
            <span className="text-xs text-gray-400">{formatDate(thread.latestDate)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t p-3 space-y-2 bg-gray-50">
          <AiBlock
            analysis={analysis}
            loading={analyzing}
            error={error}
            onAnalyze={handleAnalyze}
          />
          <div className="space-y-1">
            {thread.emails.map((email) => (
              <div key={email.id} className="rounded border bg-white p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">{email.fromName || email.from}</span>
                  <span className="text-xs text-gray-400">{formatDate(email.dateReceived)}</span>
                </div>
                {email.body && (
                  <p className="mt-1 text-xs text-gray-500 line-clamp-2">{email.body}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ThreadsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rawCount, setRawCount] = useState(0);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const emails: EmailItem[] = await fetchTodayEmails(200);
      setRawCount(emails.length);
      setThreads(groupByConversation(emails));
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="text-4xl">💬</div>
        <p className="text-sm text-gray-500 text-center">
          Загрузим переписки за сегодня
        </p>
        <button
          onClick={handleLoad}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Загрузить переписки
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Загружаем письма...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {threads.length} переписок · {rawCount} писем
        </p>
        <button onClick={handleLoad} className="text-xs text-brand-500 hover:underline">
          Обновить
        </button>
      </div>
      {threads.map((thread) => (
        <ThreadCard key={thread.conversationId} thread={thread} />
      ))}
    </div>
  );
}
