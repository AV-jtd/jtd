import type { AiAnalysis } from "../lib/types";
import { Badge } from "./Badge";
import { Spinner } from "./Spinner";

const priorityVariant = { low: "success", medium: "warning", high: "danger" } as const;
const sentimentVariant = { positive: "success", neutral: "default", negative: "danger" } as const;

export function AiBlock({
  analysis,
  loading,
  error,
  onAnalyze,
}: {
  analysis: AiAnalysis | null;
  loading: boolean;
  error: string | null;
  onAnalyze: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
        <Spinner size="sm" />
        <span>ИИ анализирует...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-3 text-xs text-red-600">
        {error}
        <button onClick={onAnalyze} className="ml-2 underline">
          Повторить
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <button
        onClick={onAnalyze}
        className="flex items-center gap-1.5 rounded-md bg-brand-50 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-100 transition-colors"
      >
        ✨ Анализировать с ИИ
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
      <div className="flex flex-wrap gap-1.5">
        <Badge variant={priorityVariant[analysis.priority]}>
          {analysis.priority === "high" ? "🔴 важное" : analysis.priority === "medium" ? "🟡 среднее" : "🟢 низкое"}
        </Badge>
        <Badge variant={sentimentVariant[analysis.sentiment]}>
          {analysis.sentiment === "positive" ? "😊 позитив" : analysis.sentiment === "negative" ? "😟 негатив" : "😐 нейтрально"}
        </Badge>
        {analysis.tags.map((tag) => (
          <Badge key={tag} variant="info">
            {tag}
          </Badge>
        ))}
      </div>

      <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>

      {analysis.keyPoints.length > 0 && (
        <div>
          <p className="font-medium text-gray-600 text-xs uppercase tracking-wide mb-1">Ключевое</p>
          <ul className="space-y-0.5">
            {analysis.keyPoints.map((pt, i) => (
              <li key={i} className="flex gap-1.5 text-gray-700">
                <span className="text-brand-500 shrink-0">•</span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.actionItems.length > 0 && (
        <div>
          <p className="font-medium text-gray-600 text-xs uppercase tracking-wide mb-1">Действия</p>
          <ul className="space-y-0.5">
            {analysis.actionItems.map((item, i) => (
              <li key={i} className="flex gap-1.5 text-gray-700">
                <span className="text-orange-500 shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onAnalyze}
        className="text-xs text-brand-500 hover:underline"
      >
        Обновить анализ
      </button>
    </div>
  );
}
