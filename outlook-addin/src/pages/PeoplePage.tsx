import { useState } from "react";
import type { AiAnalysis, EmailItem, PersonSummary } from "../lib/types";
import { fetchTodayEmails } from "../lib/ews";
import { analyzeEmail } from "../lib/ai";
import { formatDate } from "../lib/utils";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";

function PersonCard({ person, emails }: { person: PersonSummary; emails: EmailItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function handleAnalyze() {
    const latest = emails[0];
    if (!latest) return;
    setAnalyzing(true);
    try {
      const result = await analyzeEmail(latest);
      setAnalysis(result);
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
        <div className="border-t p-3 bg-gray-50 space-y-2">
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
                  <p className="text-xs font-medium text-gray-700 truncate">{e.subject}</p>
                  <span className="text-xs text-gray-400 shrink-0 ml-1">{formatDate(e.dateReceived)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PeoplePage() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [emailsByPerson, setEmailsByPerson] = useState<Map<string, EmailItem[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoad() {
    setLoading(true);
    setError(null);
    try {
      const emails = await fetchTodayEmails(200);
      const map = new Map<string, { name: string; emails: EmailItem[] }>();
      for (const e of emails) {
        const key = e.from.toLowerCase();
        const existing = map.get(key) || { name: e.fromName || e.from, emails: [] };
        existing.emails.push(e);
        map.set(key, existing);
      }

      const sortedPeople: PersonSummary[] = [...map.entries()]
        .sort((a, b) => b[1].emails.length - a[1].emails.length)
        .map(([email, { name, emails: pe }]) => ({
          email,
          name,
          emailCount: pe.length,
          lastContact: pe.sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime())[0].dateReceived,
          topics: [],
        }));

      const byPerson = new Map<string, EmailItem[]>();
      for (const [key, { emails: pe }] of map.entries()) {
        byPerson.set(key, pe.sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()));
      }

      setPeople(sortedPeople);
      setEmailsByPerson(byPerson);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (!loaded && !loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <div className="text-4xl">👥</div>
        <p className="text-sm text-gray-500 text-center">Кто писал сегодня?</p>
        <button
          onClick={handleLoad}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Загрузить по людям
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Загружаем...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{people.length} отправителей сегодня</p>
        <button onClick={handleLoad} className="text-xs text-brand-500 hover:underline">
          Обновить
        </button>
      </div>
      {people.map((p) => (
        <PersonCard
          key={p.email}
          person={p}
          emails={emailsByPerson.get(p.email) || []}
        />
      ))}
    </div>
  );
}
