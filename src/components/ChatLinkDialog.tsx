import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Link2, RefreshCw, Check, Send } from "lucide-react";

interface ChatLinkDialogProps {
  groupId: string;
  groupName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A short, human-friendly code (no ambiguous chars). */
function genCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

/** Code lifetime — long enough to link both Telegram and MAX groups calmly. */
const CODE_TTL_HOURS = 24;

export default function ChatLinkDialog({ groupId, groupName, open, onOpenChange }: ChatLinkDialogProps) {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linked, setLinked] = useState<{ telegram: boolean; max: boolean }>({ telegram: false, max: false });
  const [mirror, setMirror] = useState(true);
  const [savingMirror, setSavingMirror] = useState(false);

  // Load current binding state when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    (async () => {
      const { data } = await supabase
        .from("task_groups")
        .select("telegram_group_chat_id, max_group_chat_id, chat_mirror_enabled")
        .eq("id", groupId)
        .maybeSingle();
      setLinked({
        telegram: !!data?.telegram_group_chat_id,
        max: !!data?.max_group_chat_id,
      });
      setMirror(data?.chat_mirror_enabled ?? true);
    })();
  }, [open, groupId]);

  const toggleMirror = async (next: boolean) => {
    setMirror(next);
    setSavingMirror(true);
    try {
      const { error } = await supabase
        .from("task_groups")
        .update({ chat_mirror_enabled: next })
        .eq("id", groupId);
      if (error) throw error;
      toast.success(next ? "Синхронизация включена" : "Синхронизация выключена");
    } catch (e: any) {
      setMirror(!next);
      toast.error("Не удалось сохранить: " + (e?.message ?? "ошибка"));
    } finally {
      setSavingMirror(false);
    }
  };

  const generate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const newCode = genCode();
      const expires = new Date(Date.now() + CODE_TTL_HOURS * 3600 * 1000).toISOString();
      // Drop any previous codes for this project so only one is active.
      await supabase.from("chat_link_tokens").delete().eq("group_id", groupId).eq("created_by", user.id);
      const { error } = await supabase.from("chat_link_tokens").insert({
        code: newCode,
        group_id: groupId,
        created_by: user.id,
        channel: "any", // one universal code for both Telegram and MAX
        expires_at: expires,
      });
      if (error) throw error;
      setCode(newCode);
      setExpiresAt(expires);
    } catch (e: any) {
      toast.error("Не удалось создать код: " + (e?.message ?? "ошибка"));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/link ${code}`);
      setCopied(true);
      toast.success("Команда скопирована");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Подключить чат — {groupName}
          </DialogTitle>
          <DialogDescription>
            Привяжите группу в Telegram и/или MAX к этому проекту. Сообщения и
            задачи будут синхронизироваться как единый чат.
          </DialogDescription>
        </DialogHeader>

        {/* Current status */}
        <div className="flex gap-2 text-xs">
          <span
            className={
              "px-2 py-1 rounded-md border " +
              (linked.telegram
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/40 border-border text-muted-foreground")
            }
          >
            {linked.telegram ? "✓ Telegram привязан" : "Telegram не привязан"}
          </span>
          <span
            className={
              "px-2 py-1 rounded-md border " +
              (linked.max
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted/40 border-border text-muted-foreground")
            }
          >
            {linked.max ? "✓ MAX привязан" : "MAX не привязан"}
          </span>
        </div>

        {/* Sync toggle */}
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">Синхронизация сообщений</p>
            <p className="text-xs text-muted-foreground">
              Зеркалить сообщения чата между JTD, Telegram и MAX. Карточки задач
              отправляются всегда.
            </p>
          </div>
          <Switch
            checked={mirror}
            disabled={savingMirror}
            onCheckedChange={toggleMirror}
          />
        </div>

        {/* Steps */}
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>Создайте группу в Telegram/MAX и добавьте туда бота.</li>
          <li>Сгенерируйте код ниже.</li>
          <li>
            Отправьте в группе <code className="px-1 rounded bg-muted">/link КОД</code>. Один и тот же код
            работает и в Telegram, и в MAX.
          </li>
        </ol>

        {code ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <code className="text-base font-mono font-semibold tracking-widest text-foreground">
                /link {code}
              </code>
              <Button size="sm" variant="ghost" onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {expiresAt && (
              <p className="text-xs text-muted-foreground">
                Действует до {new Date(expiresAt).toLocaleString("ru-RU")}
              </p>
            )}
            <Button size="sm" variant="outline" className="w-full" onClick={generate} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Сгенерировать новый
            </Button>
          </div>
        ) : (
          <Button onClick={generate} disabled={loading} className="w-full">
            <Send className="h-4 w-4 mr-1.5" />
            {loading ? "Создаём…" : "Сгенерировать код"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}