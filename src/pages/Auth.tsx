import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Step = "form" | "otp";

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  // Разрешаем только same-origin относительные пути, чтобы не редиректить наружу.
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [otpCode, setOtpCode] = useState("");

  // Уже залогиненный юзер — мгновенный редирект, не ждём fetchProfile.
  // Иначе на медленной сети spinner на /auth висит до 8 сек и юзер думает,
  // что вход не работает.
  if (user) return <Navigate to={nextPath} replace />;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSendCode = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-2fa", {
        body: { action: "send", email, telegram_username: telegramUsername },
      });

      if (error || data?.error) {
        const msg = data?.message || data?.error || error?.message || "Ошибка отправки кода";
        if (data?.error === "not_found") {
          toast.error(msg, { duration: 6000 });
        } else {
          toast.error(msg);
        }
        setSubmitting(false);
        return;
      }

      toast.success("Код отправлен в Telegram!");
      setStep("otp");
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    }
    setSubmitting(false);
  };

  const handleVerifyAndSignUp = async () => {
    setSubmitting(true);
    try {
      // Verify OTP
      const { data, error } = await supabase.functions.invoke("telegram-2fa", {
        body: { action: "verify", email, code: otpCode },
      });

      if (error || data?.error) {
        toast.error(data?.message || data?.error || "Неверный код");
        setSubmitting(false);
        return;
      }

      // Code verified — now sign up
      const { error: signUpError } = await signUp(email, password, displayName, telegramUsername);
      if (signUpError) {
        toast.error(signUpError.message);
        setSubmitting(false);
        return;
      }

      // Update profile with telegram_username
      // (profile is auto-created by trigger, we update after a small delay)
      toast.success("Регистрация успешна! Проверьте email для подтверждения.");
      setStep("form");
      setOtpCode("");
    } catch (e: any) {
      toast.error(e.message || "Ошибка");
    }
    setSubmitting(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Введите email для сброса пароля");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Письмо для сброса пароля отправлено! Проверьте почту.");
    }
    setSubmitting(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
        return;
      }
      // Явный navigate сразу после успешного логина — не ждём, пока
      // useAuth закончит fetchProfile и Auth.tsx перерендерится.
      navigate(nextPath, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUp) {
      return handleSignIn(e);
    }
    // For sign up — send Telegram code first
    await handleSendCode();
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-14 w-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
              <span className="text-2xl font-black text-primary-foreground leading-none">✓</span>
            </div>
            <h1 className="text-4xl font-bold text-primary-foreground">Just<span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">TODO</span>it</h1>
          </div>
          <p className="text-lg text-primary-foreground/80">
            Организуйте задачи, управляйте проектами и делегируйте работу в одном месте.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-sm font-black text-primary-foreground leading-none">✓</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it</h1>
          </div>

          {step === "otp" && isSignUp ? (
            /* OTP verification step */
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-2">Подтверждение</h2>
                <p className="text-muted-foreground text-sm">
                  Введите 6-значный код из Telegram (@{telegramUsername.replace(/^@/, "")})
                </p>
              </div>

              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                onClick={handleVerifyAndSignUp}
                disabled={submitting || otpCode.length < 6}
                className="w-full"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Подтвердить и зарегистрироваться
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => { setStep("form"); setOtpCode(""); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ← Назад
                </button>
                <button
                  onClick={handleSendCode}
                  disabled={submitting}
                  className="text-primary hover:underline"
                >
                  Отправить код повторно
                </button>
              </div>
            </div>
          ) : (
            /* Main form */
            <>
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                {isSignUp ? "Создать аккаунт" : "Добро пожаловать!"}
              </h2>
              <p className="text-muted-foreground mb-6">
                {isSignUp ? "Заполните данные для регистрации" : "Войдите в свой аккаунт"}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <>
                    {/* Step-by-step guide */}
                    <div className="rounded-lg border border-border bg-muted/50 p-4 mb-2 space-y-3">
                      <p className="text-sm font-medium text-foreground">Как зарегистрироваться:</p>
                      <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                        <li>
                          Откройте <a href="https://t.me/Scope_todo_bot" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">@Scope_todo_bot</a> в Telegram и нажмите <span className="font-medium text-foreground">/start</span>
                        </li>
                        <li>Заполните форму ниже — укажите имя, Telegram username, email и пароль</li>
                        <li>Нажмите «Получить код в Telegram» — бот пришлёт 6-значный код</li>
                        <li>Введите код — регистрация завершена!</li>
                      </ol>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="displayName">Имя</Label>
                      <Input
                        id="displayName"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ваше имя"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="telegram" className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        Telegram username
                      </Label>
                      <Input
                        id="telegram"
                        value={telegramUsername}
                        onChange={(e) => setTelegramUsername(e.target.value)}
                        placeholder="username (без @)"
                        required
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль</Label>
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
                {!isSignUp && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={submitting}
                      className="text-xs text-primary hover:underline"
                    >
                      Забыли пароль?
                    </button>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSignUp ? "Получить код в Telegram" : "Войти"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
                <button
                  onClick={() => { setIsSignUp(!isSignUp); setStep("form"); setOtpCode(""); }}
                  className="text-primary hover:underline font-medium"
                >
                  {isSignUp ? "Войти" : "Зарегистрироваться"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
