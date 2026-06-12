import { useState } from "react";
import type { AiAnalysis, Thread } from "../lib/types";
import { getLast } from "../lib/store";
import { analyzeThread } from "../lib/ai";
import { groupByConversation, formatDate } from "../lib/utils";
import { AiBlock } from "../components/AiBlock";
import { Badge } from "../components/Badge";

type Range = "1" | "3" | "7";

function ThreadCard({ thread }: { thread: Thread }) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await analyzeThread(thread));
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
        className="w-full p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {thread.unreadCount > 0 && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              )}
              <p className="truncate text-sm font-medium text-gray-800">{thread.subject}</p>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-400">
              {thread.participants.slice(0, 3).join(", ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="info">{thread.emails.length}</Badge>
            <span className="text-xs text-gray-400">{formatDate(thread.latestDate)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t bg-gray-50 p-3">
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
                  <span className="text-xs font-medium text-gray-700">
                    {email.fromName || email.from}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(email.dateReceived)}</span>
                </div>
                {email.body && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-500">{email.body}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ThreadsPage({ storeVersion }: { storeVersion: number }) {
  const [range, setRange] = useState<Range>("1");

  const emails = getLast(Number(range));
  const threads = groupByConversation(emails);

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
        <div className="text-4xl">💬</div>
        <p className="text-sm text-gray-500">
          Откройте письма в Outlook — они появятся здесь автоматически
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["1", "3", "7"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                range === r
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {r === "1" ? "сегодня" : r === "3" ? "3 дня" : "неделя"}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {threads.length} веток · {emails.length} писем
        </p>
      </div>

      {threads.map((thread) => (
        <ThreadCard key={thread.conversationId} thread={thread} />
      ))}
    </div>
  );
}
