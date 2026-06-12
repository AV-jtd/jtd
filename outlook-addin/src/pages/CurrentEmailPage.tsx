import { useEffect, useState } from "react";
import type { AiAnalysis, EmailItem } from "../lib/types";
import { captureCurrentItem } from "../lib/capture";
import { analyzeEmail } from "../lib/ai";
import { AiBlock } from "../components/AiBlock";
import { Spinner } from "../components/Spinner";
import { formatDateFull } from "../lib/utils";

export function CurrentEmailPage({ onCapture }: { onCapture?: () => void }) {
  const [email, setEmail] = useState<EmailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureCurrentItem()
      .then((result) => {
        if (result) {
          setEmail(result.email);
          setIsNew(result.isNew);
          if (result.isNew) onCapture?.();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [onCapture]);

  async function handleAnalyze() {
    if (!email) return;
    setAnalyzing(true);
    setError(null);
    try {
      setAnalysis(await analyzeEmail(email));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка анализа");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">
        Выберите письмо в Outlook
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-gray-800 leading-snug">{email.subject}</h2>
          {isNew && (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
              сохранено
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>{email.fromName || email.from}</span>
          <span>·</span>
          <span>{formatDateFull(email.dateReceived)}</span>
        </div>
        {email.hasAttachments && (
          <div className="mt-1 text-xs text-gray-400">📎 Есть вложения</div>
        )}
      </div>

      <AiBlock
        analysis={analysis}
        loading={analyzing}
        error={error}
        onAnalyze={handleAnalyze}
      />

      {email.body && (
        <div className="rounded-lg border bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Текст письма
          </p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-700">
            {email.body}
          </p>
        </div>
      )}
    </div>
  );
}
