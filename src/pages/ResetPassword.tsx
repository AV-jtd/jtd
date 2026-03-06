import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
      setChecking(false);
    });

    // Also check hash params for type=recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    // Fallback timeout
    const timer = setTimeout(() => setChecking(false), 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }
    if (password.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      setSuccess(true);
      toast.success("Пароль успешно изменён!");
      setTimeout(() => navigate("/"), 2000);
    }
    setSubmitting(false);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isRecovery && !success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Недействительная ссылка</h2>
          <p className="text-muted-foreground text-sm">
            Ссылка для сброса пароля недействительна или устарела. Запросите новую.
          </p>
          <Button onClick={() => navigate("/auth")} variant="outline" className="w-full">
            Вернуться к входу
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <h2 className="text-2xl font-semibold text-foreground">Пароль изменён!</h2>
          <p className="text-muted-foreground text-sm">Перенаправление...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-sm font-black text-primary-foreground leading-none">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it
          </h1>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mb-2">Новый пароль</h2>
        <p className="text-muted-foreground mb-6 text-sm">Введите новый пароль для вашего аккаунта</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Новый пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить пароль
          </Button>
        </form>
      </div>
    </div>
  );
}
