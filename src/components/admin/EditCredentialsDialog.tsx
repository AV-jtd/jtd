import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, MessageCircle, Mail } from "lucide-react";
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // reset on open
  const handleOpenChange = (v: boolean) => {
    if (v && user) {
      setTg(user.telegram_username ?? "");
      setEmail(user.email ?? "");
      setPassword("");
    }
    onOpenChange(v);
  };

  if (!user) return null;

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
    onUpdated(patch);
    toast.success("Данные обновлены");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Редактировать данные</DialogTitle>
          <DialogDescription>
            {user.display_name || user.email}. Оставьте поле пустым, чтобы не менять.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
              <KeyRound className="h-3.5 w-3.5" /> Новый пароль
            </Label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              type="text"
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">
              Сообщите пароль пользователю лично. Он сможет сменить его в настройках.
            </p>
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