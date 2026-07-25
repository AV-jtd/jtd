import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauthApi = () => (supabase.auth as any).oauth as OAuthApi;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) { setError("Отсутствует authorization_id в URL"); return; }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      setUserEmail(sess.session.user.email ?? null);
      try {
        const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) { setError(error.message); return; }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) { window.location.href = immediate; return; }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Не удалось загрузить запрос авторизации");
      }
    })();
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const api = oauthApi();
      const res = approve
        ? await api.approveAuthorization(authorizationId)
        : await api.denyAuthorization(authorizationId);
      if (res.error) { setBusy(false); setError(res.error.message); return; }
      const target = res.data?.redirect_url ?? res.data?.redirect_to;
      if (!target) { setBusy(false); setError("Провайдер не вернул redirect URL"); return; }
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      setError(e?.message ?? "Ошибка обработки решения");
    }
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 space-y-3">
          <h1 className="text-lg font-semibold text-foreground">Не удалось обработать запрос</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Повторить</Button>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "Внешнее приложение";
  const redirectUri = details.client?.redirect_uris?.[0] ?? details.client?.redirect_uri;
  const scopes: string[] = Array.isArray(details.scopes)
    ? details.scopes
    : typeof details.scope === "string" ? details.scope.split(/\s+/).filter(Boolean) : [];

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 space-y-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2"><ShieldCheck className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Подключить {clientName} к JustTODOit</h1>
            {userEmail && <p className="text-xs text-muted-foreground mt-0.5">Ваш аккаунт: {userEmail}</p>}
          </div>
        </div>
        <p className="text-sm text-foreground/90">
          Приложение <b>{clientName}</b> сможет вызывать инструменты JustTODOit от вашего имени —
          читать задачи, проекты, протоколы и CRM-клиентов, а также создавать/закрывать задачи.
        </p>
        {scopes.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <div className="font-medium mb-1">Запрошенные права:</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {scopes.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        )}
        {redirectUri && (
          <div className="text-[11px] text-muted-foreground break-all">
            Возврат на: <span className="font-mono">{redirectUri}</span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Разрешение не обходит RLS-политики JTD: приложение увидит только то, что видите вы.
        </p>
        <div className="flex gap-2 pt-2">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Разрешить"}
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Отклонить
          </Button>
        </div>
      </div>
    </main>
  );
}