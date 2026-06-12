import { useState } from "react";
import type { AiAnalysis, EmailItem, PersonSummary } from "../lib/types";
import { getLast } from "../lib/store";
import { analyzeEmail } from "../lib/ai";
import { formatDate } from "../lib/utils";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";

type Range = "1" | "3" | "7";

function PersonCard({ person, emails }: { person: PersonSummary; emails: EmailItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function handleAnalyze() {
    const latest = emails[0];
    if (!latest) return;
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeEmail(latest));
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">{person.name}</p>
            <p className="text-xs text-gray-400">{person.email}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="default">{person.emailCount} писем</Badge>
            <span className="text-xs text-gray-400">{formatDate(person.lastContact)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t bg-gray-50 p-3">
          {analysis ? (
            <div className="rounded-md border border-brand-100 bg-brand-50 p-2">
              <p className="text-xs text-gray-700">{analysis.summary}</p>
              {analysis.actionItems?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {analysis.actionItems.map((a, i) => (
                    <li key={i} className="text-xs text-gray-600">→ {a}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:underline disabled:opacity-50"
            >
              {analyzing ? <Spinner size="sm" /> : "✨"} Анализировать переписку
            </button>
          )}

          <div className="space-y-1">
            {emails.slice(0, 5).map((e) => (
              <div key={e.id} className="rounded border bg-white p-2">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs font-medium text-gray-700">{e.subject}</p>
                  <span className="ml-1 shrink-0 text-xs text-gray-400">
                    {formatDate(e.dateReceived)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PeoplePage({ storeVersion }: { storeVersion: number }) {
  const [range, setRange] = useState<Range>("1");

  const emails = getLast(Number(range));

  const map = new Map<string, { name: string; emails: EmailItem[] }>();
  for (const e of emails) {
    const key = e.from.toLowerCase();
    const existing = map.get(key) || { name: e.fromName || e.from, emails: [] };
    existing.emails.push(e);
    map.set(key, existing);
  }

  const people: PersonSummary[] = [...map.entries()]
    .sort((a, b) => b[1].emails.length - a[1].emails.length)
    .map(([email, { name, emails: pe }]) => ({
      email,
      name,
      emailCount: pe.length,
      lastContact: pe.sort(
        (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
      )[0].dateReceived,
      topics: [],
    }));

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
        <div className="text-4xl">👥</div>
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
        <p className="text-xs text-gray-400">{people.length} человек</p>
      </div>

      {people.map((p) => (
        <PersonCard
          key={p.email}
          person={p}
          emails={
            map
              .get(p.email)
              ?.emails.sort(
                (a, b) =>
                  new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
              ) || []
          }
        />
      ))}
    </div>
  );
}
