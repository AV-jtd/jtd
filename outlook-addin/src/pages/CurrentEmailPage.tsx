import { useEffect, useState } from "react";
import type { AiAnalysis, EmailItem } from "../lib/types";
import { fetchCurrentEmail } from "../lib/ews";
import { analyzeEmail } from "../lib/ai";
import { AiBlock } from "../components/AiBlock";
import { Spinner } from "../components/Spinner";
import { formatDateFull } from "../lib/utils";

export function CurrentEmailPage() {
  const [email, setEmail] = useState<EmailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentEmail()
      .then(setEmail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAnalyze() {
    if (!email) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeEmail(email);
      setAnalysis(result);
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
        <h2 className="font-semibold text-gray-800 leading-snug">{email.subject}</h2>
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
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Текст письма
          </p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {email.body}
          </p>
        </div>
      )}
    </div>
  );
}
