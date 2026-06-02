import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Link2, Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX_EVENTS: { key: string; label: string }[] = [
  { key: "max_task_assigned", label: "Назначен ответственным" },
  { key: "max_task_completed", label: "Завершение задачи" },
  { key: "max_task_commented", label: "Новый комментарий" },
  { key: "max_deadline_approaching", label: "Приближение дедлайна" },
];

/**
 * MAX is a SECOND, alternative messenger channel alongside Telegram — never a replacement.
 * This card lets a user link their MAX account and toggle MAX notifications.
 */
export default function MaxLinkCard() {
  const { user } = useAuth();
  const { prefs, updatePrefs } = useNotificationPreferences();

  const [linked, setLinked] = useState<boolean | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("max_user_id")
      .eq("id", user.id)
      .maybeSingle();
    setLinked(!!(data as any)?.max_user_id);
  }, [user]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const startLinking = async () => {
    if (!user) return;
    setLoadingLink(true);
    try {
      // 1. Generate a short-lived link token (RLS: user owns it).
      const newToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const { error: insErr } = await supabase
        .from("max_link_tokens")
        .insert({ token: newToken, user_id: user.id });
      if (insErr) throw insErr;

      // 2. Resolve the bot username to build a deep-link.
      const { data, error } = await supabase.functions.invoke("max-webhook", {
        body: { action: "bot_info" },
      });
      if (error) throw error;
      const username = (data as any)?.username as string | undefined;
      setBotUsername(username ?? null);
      setToken(newToken);
    } catch (e: any) {
      toast.error("Не удалось начать привязку MAX", { description: e?.message });
    } finally {
      setLoadingLink(false);
    }
  };

  const copyToken = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const botLink = botUsername ? `https://max.ru/${botUsername}` : null;

  return (
    <div className="space-y-4">
      {/* Link status / actions */}
      {linked ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-sm">Аккаунт MAX привязан. Уведомления будут приходить в MAX.</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={startLinking} disabled={loadingLink}>
            Перепривязать
          </Button>
        </div>
      ) : (
        <Button onClick={startLinking} disabled={loadingLink} className="w-full">
          {loadingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          Привязать аккаунт MAX
        </Button>
      )}

      {/* Instructions once a token is generated */}
      {token && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium">Как привязать (1 минута):</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Откройте бота JustTODOit в MAX.</li>
            <li>Отправьте боту этот код привязки:</li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono tracking-wider">{token}</code>
            <Button variant="outline" size="icon" onClick={copyToken}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {botLink && (
            <a href={botLink} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                Открыть бота в MAX
              </Button>
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            Код действует 1 час. После отправки бот подтвердит привязку — обновите эту страницу.
          </p>
        </div>
      )}

      {/* MAX notification toggles */}
      {prefs && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
            Уведомления в MAX
          </div>
          {MAX_EVENTS.map((e, idx) => (
            <div
              key={e.key}
              className={cn(
                "flex items-center justify-between px-4 py-2.5",
                idx !== MAX_EVENTS.length - 1 && "border-b border-border",
              )}
            >
              <span className="text-sm">{e.label}</span>
              <Switch
                checked={!!(prefs as any)[e.key]}
                onCheckedChange={(v) => updatePrefs.mutate({ [e.key]: v } as any)}
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        MAX — дополнительный канал рядом с Telegram, не замена. Можно использовать оба одновременно.
      </p>
    </div>
  );
}