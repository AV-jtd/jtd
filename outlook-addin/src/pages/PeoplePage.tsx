import { useEffect, useState } from "react";
import type { EmailItem, PersonDossier } from "../lib/types";
import { getEmailsSince } from "../lib/db";
import { buildPersonDossier } from "../lib/ai";
import { formatDate } from "../lib/utils";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";

type Range = 7 | 30 | 90;

function DossierBlock({ name, email, emails }: { name: string; email: string; emails: EmailItem[] }) {
  const [dossier, setDossier] = useState<PersonDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuild() {
    setLoading(true);
    setError(null);
    try {
      setDossier(await buildPersonDossier(name, email, emails));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
        <Spinner size="sm" /> ИИ составляет досье...
      </div>
    );
  }

  if (!dossier) {
    return (
      <div>
        <button
          onClick={handleBuild}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
        >
          ✨ Составить досье
        </button>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-brand-100 bg-brand-50 p-2.5 text-sm">
      <p className="text-gray-700">{dossier.relationship}</p>

      {dossier.openItems?.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Открытые вопросы</p>
          <ul className="mt-0.5 space-y-0.5">
            {dossier.openItems.map((item, i) => (
              <li key={i} className="text-xs text-gray-700">• {item}</li>
            ))}
          </ul>
        </div>
      )}

      {dossier.promises?.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Обещания</p>
          <ul className="mt-0.5 space-y-0.5">
            {dossier.promises.map((p, i) => (
              <li key={i} className="text-xs text-gray-700">
                {p.direction === "they" ? "🫳 Они:" : "🫴 Ты:"} {p.text}{" "}
                {p.status === "open" ? <span className="text-orange-500">⏳</span> : "✓"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dossier.recommendedAction && (
        <div className="rounded bg-white p-2">
          <p className="text-xs font-medium text-brand-600">💡 Рекомендация</p>
          <p className="mt-0.5 text-xs text-gray-700">{dossier.recommendedAction}</p>
        </div>
      )}
    </div>
  );
}

export function PeoplePage() {
  const [range, setRange] = useState<Range>(7);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getEmailsSince(range).then(setEmails);
  }, [range]);

  const map = new Map<string, { name: string; emails: EmailItem[] }>();
  for (const e of emails) {
    if (!e.from) continue;
    const key = e.from.toLowerCase();
    const ex = map.get(key) || { name: e.fromName || e.from, emails: [] };
    ex.emails.push(e);
    map.set(key, ex);
  }

  const people = [...map.entries()]
    .sort((a, b) => b[1].emails.length - a[1].emails.length)
    .map(([email, { name, emails: pe }]) => ({
      email,
      name,
      emails: pe.sort(
        (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
      ),
    }));

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <div className="text-4xl">👥</div>
        <p className="text-sm text-gray-500">
          В базе нет писем за период. Синхронизируй на вкладке «Разбор».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {([7, 30, 90] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                range === r
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {r} дн.
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">{people.length} человек</p>
      </div>

      {people.map((p) => (
        <div key={p.email} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <button
            onClick={() => setExpanded(expanded === p.email ? null : p.email)}
            className="w-full p-3 text-left hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{p.name}</p>
                <p className="truncate text-xs text-gray-400">{p.email}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="default">{p.emails.length} писем</Badge>
                <span className="text-xs text-gray-400">
                  {formatDate(p.emails[0].dateReceived)}
                </span>
              </div>
            </div>
          </button>

          {expanded === p.email && (
            <div className="space-y-2 border-t bg-gray-50 p-3">
              <DossierBlock name={p.name} email={p.email} emails={p.emails} />
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {p.emails.slice(0, 10).map((e) => (
                  <div key={e.id} className="rounded border bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-gray-700">{e.subject}</p>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatDate(e.dateReceived)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
