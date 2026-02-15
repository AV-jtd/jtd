import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, MessageCircle, Sun, Moon, Monitor, Palette, Bell, BellOff, Mail } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTheme, ACCENT_PRESETS } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import TeamSection from "@/components/TeamSection";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function Settings() {
  const { user, loading } = useAuth();
  const { mode, setMode, accentColor, setAccentColor } = useTheme();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [telegramUsername, setTelegramUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [customHue, setCustomHue] = useState(accentColor);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, telegram_username, work_email")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name || "");
          setTelegramUsername((data as any).telegram_username || "");
          setWorkEmail((data as any).work_email || "");
        }
        setLoadingProfile(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleSave = async () => {
    setSaving(true);
    const cleanUsername = telegramUsername.replace(/^@/, "").toLowerCase().trim();

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        telegram_username: cleanUsername || null,
        work_email: workEmail.trim() || null,
      } as any)
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Настройки сохранены");
    }
    setSaving(false);
  };

  const themeModes: { id: "light" | "dark" | "system"; label: string; icon: React.ElementType }[] = [
    { id: "light", label: "Светлая", icon: Sun },
    { id: "dark", label: "Тёмная", icon: Moon },
    { id: "system", label: "Системная", icon: Monitor },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад к задачам
        </Link>

        <h1 className="text-2xl font-semibold text-foreground mb-6">Настройки профиля</h1>

        {loadingProfile ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Profile */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Имя</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ваше имя"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="workEmail" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Рабочий email
                </Label>
                <Input
                  id="workEmail"
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="work@company.com"
                />
                <p className="text-xs text-muted-foreground">
                  Добавьте рабочий email, чтобы создавать задачи с обоих адресов.
                </p>
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
                />
                <p className="text-xs text-muted-foreground">
                  Привяжите Telegram, чтобы создавать задачи прямо из бота.
                </p>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Сохранить
              </Button>
            </div>

            {/* Theme section */}
            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">Оформление</h2>
              </div>

              {/* Light/Dark/System */}
              <div className="space-y-2">
                <Label>Тема</Label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {themeModes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setMode(t.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
                        mode === t.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <t.icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent color presets */}
              <div className="space-y-2">
                <Label>Цвет акцента</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map(p => (
                    <button
                      key={p.hue}
                      onClick={() => { setAccentColor(p.hue); setCustomHue(p.hue); }}
                      className={cn(
                        "h-9 w-9 rounded-full border-2 transition-all",
                        accentColor === p.hue ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: `hsl(${p.hue}, 91%, 60%)` }}
                      title={p.name}
                    />
                  ))}
                </div>
              </div>

              {/* Custom hue slider */}
              <div className="space-y-2">
                <Label>Произвольный цвет (оттенок)</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={customHue}
                    onChange={(e) => {
                      setCustomHue(e.target.value);
                      setAccentColor(e.target.value);
                    }}
                    className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: "linear-gradient(to right, hsl(0,91%,60%), hsl(60,91%,60%), hsl(120,91%,60%), hsl(180,91%,60%), hsl(240,91%,60%), hsl(300,91%,60%), hsl(360,91%,60%))",
                    }}
                  />
                  <div
                    className="h-8 w-8 rounded-full border border-border shrink-0"
                    style={{ backgroundColor: `hsl(${customHue}, 91%, 60%)` }}
                  />
                </div>
              </div>
            </div>

            {/* Push notifications */}
            {pushSupported && (
              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-medium">Push-уведомления</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Получайте уведомления о дедлайнах и назначенных задачах, даже когда приложение закрыто.
                </p>
                <Button
                  variant={pushSubscribed ? "outline" : "default"}
                  onClick={pushSubscribed ? pushUnsubscribe : pushSubscribe}
                  disabled={pushLoading}
                  className="w-full"
                >
                  {pushLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : pushSubscribed ? (
                    <BellOff className="mr-2 h-4 w-4" />
                  ) : (
                    <Bell className="mr-2 h-4 w-4" />
                  )}
                  {pushSubscribed ? "Отключить уведомления" : "Включить уведомления"}
                </Button>
              </div>
            )}

            {/* Teams section */}
            <div className="border-t border-border pt-6">
              <TeamSection />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
