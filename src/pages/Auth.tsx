import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { user, loading } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();

  // 2FA OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (isSignUp) {
      const { error } = await signUp(email, password, displayName);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Проверьте email для подтверждения регистрации!");
      }
    } else {
      // Step 1: verify password
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error.message);
      } else {
        // Password correct — sign out and send OTP for 2FA
        await supabase.auth.signOut();
        const { error: otpError } = await supabase.auth.signInWithOtp({ email });
        if (otpError) {
          toast.error("Ошибка отправки кода: " + otpError.message);
        } else {
          setOtpEmail(email);
          setOtpStep(true);
          toast.success("Код подтверждения отправлен на " + email);
        }
      }
    }
    setSubmitting(false);
  };

  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) return;
    setSubmitting(true);
    const { error } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpCode,
      type: "email",
    });
    if (error) {
      toast.error("Неверный код: " + error.message);
    }
    setSubmitting(false);
  };

  const handleBackToLogin = () => {
    setOtpStep(false);
    setOtpCode("");
    setOtpEmail("");
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
            <h1 className="text-4xl font-bold text-primary-foreground">Just<span className="opacity-90">TODO</span>it</h1>
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
            <h1 className="text-2xl font-bold text-foreground">Just<span className="text-primary">TODO</span>it</h1>
          </div>

          {otpStep ? (
            // OTP verification step
            <div>
              <button onClick={handleBackToLogin} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Назад
              </button>
              <h2 className="text-2xl font-semibold text-foreground mb-2">Подтверждение входа</h2>
              <p className="text-muted-foreground mb-6">
                Введите 6-значный код, отправленный на <span className="font-medium text-foreground">{otpEmail}</span>
              </p>
              <div className="flex justify-center mb-6">
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
              <Button onClick={handleOtpVerify} className="w-full" disabled={submitting || otpCode.length !== 6}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Подтвердить
              </Button>
            </div>
          ) : (
            // Login / Signup form
            <>
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                {isSignUp ? "Создать аккаунт" : "Добро пожаловать!"}
              </h2>
              <p className="text-muted-foreground mb-6">
                {isSignUp ? "Заполните данные для регистрации" : "Войдите в свой аккаунт"}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
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
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isSignUp ? "Зарегистрироваться" : "Войти"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {isSignUp ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
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
