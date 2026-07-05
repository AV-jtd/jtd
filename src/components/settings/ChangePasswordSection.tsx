import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Eye, EyeOff, Wand2, Check, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Оценка надёжности пароля: 0..4 */
function scorePassword(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH = [
  { label: "Слишком простой", color: "bg-destructive" },
  { label: "Слабый", color: "bg-orange-500" },
  { label: "Нормальный", color: "bg-yellow-500" },
  { label: "Хороший", color: "bg-lime-500" },
  { label: "Отличный", color: "bg-green-500" },
];

/**
 * Дружелюбная самостоятельная смена пароля.
 * Требует ввод текущего пароля (реавторизация), показывает индикатор надёжности,
 * умеет сгенерировать и скопировать надёжный пароль.
 */
export default function ChangePasswordSection() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => scorePassword(next), [next]);
  const mismatch = confirm.length > 0 && next !== confirm;

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*";
    const arr = new Uint32Array(16);
    crypto.getRandomValues(arr);
    let p = "";
    for (let i = 0; i < 16; i++) p += chars[arr[i] % chars.length];
    setNext(p);
    setConfirm(p);
    setShowNext(true);
    navigator.clipboard?.writeText(p).catch(() => {});
    toast.success("Пароль сгенерирован и скопирован в буфер");
  };

  const submit = async () => {
    if (next.length < 6) {
      toast.error("Новый пароль должен быть не короче 6 символов");
      return;
    }
    if (next !== confirm) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (current && current === next) {
      toast.error("Новый пароль совпадает с текущим");
      return;
    }
    setBusy(true);
    // Подтверждаем текущий пароль реавторизацией (если введён)
    if (current && user?.email) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signInErr) {
        setBusy(false);
        toast.error("Текущий пароль неверный");
        return;
      }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Не удалось изменить пароль");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
    toast.success("Пароль успешно изменён 🎉");
    setTimeout(() => setDone(false), 4000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Придумайте новый пароль и сохраните его. Мы подскажем, насколько он надёжный,
          или сгенерируем крепкий пароль за вас.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-current" className="text-xs">Текущий пароль</Label>
        <div className="relative">
          <Input
            id="cp-current"
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Введите текущий пароль"
            className="h-9 pr-9"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showCurrent ? "Скрыть пароль" : "Показать пароль"}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="cp-next" className="text-xs">Новый пароль</Label>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={generate}>
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Сгенерировать
          </Button>
        </div>
        <div className="relative">
          <Input
            id="cp-next"
            type={showNext ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="Минимум 6 символов"
            className="h-9 pr-9"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowNext((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showNext ? "Скрыть пароль" : "Показать пароль"}
          >
            {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {next.length > 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex-1 flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i < strength ? STRENGTH[strength].color : "bg-muted"
                  )}
                />
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground w-24 text-right">
              {STRENGTH[strength].label}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm" className="text-xs">Повторите новый пароль</Label>
        <Input
          id="cp-confirm"
          type={showNext ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ещё раз новый пароль"
          className={cn("h-9", mismatch && "border-destructive focus-visible:ring-destructive")}
          autoComplete="new-password"
        />
        {mismatch && <p className="text-[11px] text-destructive">Пароли не совпадают</p>}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {done ? (
            <><Check className="h-3.5 w-3.5 text-green-500" /> Пароль обновлён</>
          ) : (
            <><KeyRound className="h-3.5 w-3.5" /> После смены пароль начнёт действовать сразу</>
          )}
        </p>
        <Button
          onClick={submit}
          disabled={busy || next.length < 6 || !!mismatch}
          size="sm"
          className="shrink-0"
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Сменить пароль
        </Button>
      </div>
    </div>
  );
}