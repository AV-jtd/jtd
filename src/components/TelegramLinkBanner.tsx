import { useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "tg_link_banner_dismissed_until";
const BOT_USERNAME = "Scope_todo_bot";

/**
 * Top banner prompting users to open the Telegram bot in DM so the bot
 * can send personal reports/notifications. Shown only when the profile
 * has telegram_username but no telegram_chat_id. Dismissable for 7 days.
 */
export default function TelegramLinkBanner() {
  const { user } = useAuth();
  const [needsLink, setNeedsLink] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return Number.isFinite(until) && Date.now() < until;
    } catch { return false; }
  });

  useEffect(() => {
    if (!user || dismissed) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("telegram_username, telegram_chat_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setNeedsLink(!!data?.telegram_username && !data?.telegram_chat_id);
    })();
    return () => { cancelled = true; };
  }, [user, dismissed]);

  if (!user || !needsLink || dismissed) return null;

  const link = `https://t.me/${BOT_USERNAME}?start=link_${user.id}`;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch {}
    setDismissed(true);
  };

  return (
    <div className={cn(
      "shrink-0 flex items-center gap-3 px-3 md:px-4 py-2 border-b border-border",
      "bg-primary/5 text-foreground text-sm"
    )}>
      <Send className="h-4 w-4 text-primary shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        Подключи бота: пиши задачи, получай уведомления, ИИ-анализ.
      </span>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
      >
        Подключить
      </a>
      <button
        onClick={handleDismiss}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        title="Скрыть на 7 дней"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}