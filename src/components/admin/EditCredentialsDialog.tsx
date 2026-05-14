import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, MessageCircle, Mail, Wand2, Send, LogOut, User, Link2, Unlink, MailCheck, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AdminUser } from "./types";

interface Props {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: (patch: Partial<AdminUser>) => void;
}

export function EditCredentialsDialog({ user, open, onOpenChange, onUpdated }: Props) {
  const [tg, setTg] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // reset on open
  const handleOpenChange = (v: boolean) => {
    if (v && user) {
      setTg(user.telegram_username ?? "");
      setEmail(user.email ?? "");
      setName(user.display_name ?? "");
      setPassword("");
      setChatId(user.telegram_chat_id != null ? String(user.telegram_chat_id) : "");
    }
    onOpenChange(v);
  };

  if (!user) return null;

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let p = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) p += chars[arr[i] % chars.length];
    setPassword(p);
    navigator.clipboard?.writeText(p).catch(() => {});
    toast.success("Пароль сгенерирован и скопирован в буфер");
  };

  type Action =
    | "send_recovery"
    | "sign_out_everywhere"
    | "confirm_email"
    | "impersonate"
    | "bind_telegram_chat"
    | "unbind_telegram_chat";

  const runAction = async (action: Action) => {
    setActionBusy(action);
    const body: Record<string, unknown> = { target_user_id: user.id, action };
    if (action === "send_recovery" || action === "impersonate") {
      body.redirect_to = `${window.location.origin}/reset-password`;
      if (action === "impersonate") body.redirect_to = `${window.location.origin}/`;
    }
    if (action === "bind_telegram_chat") {
      const cleaned = chatId.trim();
      if (!/^-?\d{4,20}$/.test(cleaned)) {
        toast.error("chat_id должен быть числом");
        setActionBusy(null);
        return;
      }
      body.telegram_chat_id = cleaned;
    }
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body });
    setActionBusy(null);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.message || (data as any)?.error || error?.message || "Ошибка";
      toast.error(msg);
      return;
    }
    switch (action) {
      case "send_recovery":
        toast.success("Письмо со ссылкой для сброса отправлено");
        break;
      case "sign_out_everywhere":
        toast.success("Все сессии пользователя завершены");
        break;
      case "confirm_email":
        toast.success("Email подтверждён");
        break;
      case "bind_telegram_chat":
        toast.success("Telegram chat_id привязан");
        break;
      case "unbind_telegram_chat":
        toast.success("Telegram chat_id отвязан");
        setChatId("");
        break;
      case "impersonate": {
        const link = (data as any)?.action_link as string | undefined;
        if (!link) {
          toast.error("Ссылка не получена");
          return;
        }
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        toast.success("Ссылка скопирована. Откройте в приватном окне, чтобы войти.");
        window.open(link, "_blank", "noopener");
        break;
      }
    }
  };

  const submit = async () => {
    setBusy(true);
    const body: Record<string, unknown> = { target_user_id: user.id };
    const cleanedTg = tg.trim().replace(/^@/, "").toLowerCase();
    if (cleanedTg !== (user.telegram_username ?? "")) {
      body.telegram_username = cleanedTg || null;
    }
    const cleanedEmail = email.trim().toLowerCase();
    if (cleanedEmail && cleanedEmail !== (user.email ?? "").toLowerCase()) {
      body.email = cleanedEmail;
    }
    const cleanedName = name.trim();
    if (cleanedName !== (user.display_name ?? "")) {
      body.display_name = cleanedName || null;
    }
    if (password) body.new_password = password;

    if (Object.keys(body).length === 1) {
      toast.info("Ничего не изменено");
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.functions.invoke("admin-update-user", { body });
    setBusy(false);

    if (error || (data as any)?.error) {
      const msg = (data as any)?.message || (data as any)?.error || error?.message || "Ошибка";
      toast.error(msg);
      return;
    }

    const patch: Partial<AdminUser> = {};
    if (body.telegram_username !== undefined) patch.telegram_username = body.telegram_username as string | null;
    if (body.email !== undefined) patch.email = body.email as string;
    if (body.display_name !== undefined) patch.display_name = body.display_name as string | null;
    onUpdated(patch);
    toast.success("Данные обновлены");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактировать данные</DialogTitle>
          <DialogDescription>
            {user.display_name || user.email}. Оставьте поле пустым, чтобы не менять.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Имя
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя пользователя" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Email
            </Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              type="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" /> Telegram username
            </Label>
            <Input
              value={tg}
              onChange={(e) => setTg(e.target.value)}
              placeholder="username (без @)"
            />
            <p className="text-[11px] text-muted-foreground">
              При смене username привязка к Telegram-чату сбрасывается — пользователь должен заново открыть бота.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Telegram chat_id
            </Label>
            <div className="flex gap-2">
              <Input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="например 123456789"
                inputMode="numeric"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("bind_telegram_chat")}
                disabled={!!actionBusy || !chatId.trim()}
              >
                {actionBusy === "bind_telegram_chat"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Link2 className="h-3.5 w-3.5 mr-1" /> Привязать</>}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("unbind_telegram_chat")}
                disabled={!!actionBusy || !user.telegram_chat_id}
              >
                {actionBusy === "unbind_telegram_chat"
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Unlink className="h-3.5 w-3.5 mr-1" /> Отвязать</>}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Числовой chat_id из Telegram. Подходит, когда пользователь не может сделать /start (например, бот молчит).
              Узнать chat_id можно через @userinfobot или из логов бота.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Новый пароль
              </Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={generatePassword}>
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Сгенерировать
              </Button>
            </div>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              type="text"
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">
              Сгенерированный пароль автоматически копируется в буфер. Передайте его пользователю лично.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium">Быстрые действия</p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("send_recovery")}
                disabled={!!actionBusy}
                className="justify-start"
              >
                {actionBusy === "send_recovery"
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-2" />}
                Выслать письмо со ссылкой для сброса пароля
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("confirm_email")}
                disabled={!!actionBusy}
                className="justify-start"
              >
                {actionBusy === "confirm_email"
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <MailCheck className="h-3.5 w-3.5 mr-2" />}
                Подтвердить email вручную
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("impersonate")}
                disabled={!!actionBusy}
                className="justify-start"
              >
                {actionBusy === "impersonate"
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <UserCheck className="h-3.5 w-3.5 mr-2" />}
                Войти как пользователь (magic-link)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => runAction("sign_out_everywhere")}
                disabled={!!actionBusy}
                className="justify-start"
              >
                {actionBusy === "sign_out_everywhere"
                  ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                  : <LogOut className="h-3.5 w-3.5 mr-2" />}
                Завершить все сессии пользователя
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}