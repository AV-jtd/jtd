import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, MessageCircle, Sun, Moon, Monitor, Palette, Bell, BellOff, Mail, Download, Upload, CalendarSync, Copy, Check, RefreshCw } from "lucide-react";
import SmartImportDialog from "@/components/SmartImportDialog";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTheme, ACCENT_PRESETS } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import TeamSection from "@/components/TeamSection";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { Switch } from "@/components/ui/switch";

export default function Settings() {
  const { user, loading } = useAuth();
  const { mode, setMode, accentColor, setAccentColor } = useTheme();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const { prefs, updatePrefs } = useNotificationPreferences();
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
      .select("display_name, telegram_username, work_email, username")
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

            {/* Notifications */}
            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">Уведомления</h2>
              </div>

              {/* Push subscribe toggle */}
              {pushSupported && (
                <div className="space-y-3">
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
                    {pushSubscribed ? "Отключить Web Push" : "Включить Web Push"}
                  </Button>
                </div>
              )}

              {/* Event toggles */}
              {prefs && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-3">События для Web Push</p>
                  {([
                    { key: "push_task_assigned", label: "Назначен ответственным" },
                    { key: "push_task_participant_added", label: "Добавлен участником в задачу" },
                    { key: "push_task_completed", label: "Завершение задачи (где участник)" },
                    { key: "push_task_commented", label: "Новый комментарий к задаче" },
                    { key: "push_added_to_group", label: "Добавление в проект/подпроект" },
                    { key: "push_new_task_in_group", label: "Новая задача в моём проекте" },
                    { key: "push_deadline_approaching", label: "Приближение дедлайна" },
                  ] as { key: keyof typeof prefs; label: string }[]).map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={!!prefs[item.key]}
                        onCheckedChange={(v) => updatePrefs.mutate({ [item.key]: v })}
                      />
                    </div>
                  ))}

                  <p className="text-xs font-medium text-muted-foreground mb-3 mt-5">События для Telegram</p>
                  {([
                    { key: "telegram_task_assigned", label: "Назначен ответственным" },
                    { key: "telegram_task_participant_added", label: "Добавлен участником в задачу" },
                    { key: "telegram_task_completed", label: "Завершение задачи (где участник)" },
                    { key: "telegram_task_commented", label: "Новый комментарий к задаче" },
                    { key: "telegram_added_to_group", label: "Добавление в проект/подпроект" },
                    { key: "telegram_new_task_in_group", label: "Новая задача в моём проекте" },
                    { key: "telegram_deadline_approaching", label: "Приближение дедлайна" },
                  ] as { key: keyof typeof prefs; label: string }[]).map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={!!prefs[item.key]}
                        onCheckedChange={(v) => updatePrefs.mutate({ [item.key]: v })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar Subscription */}
            <CalendarSubscription userId={user.id} />

            {/* Import/Export */}
            <div className="border-t border-border pt-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Импорт / Экспорт
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                Импортируйте проект из Excel-файла (.xlsx). Экспорт доступен в контекстном меню проекта в сайдбаре.
              </p>
              <ImportProjectDialog />
            </div>

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

function CalendarSubscription({ userId }: { userId: string }) {
  const [calUrl, setCalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

  useEffect(() => {
    supabase
      .from("calendar_tokens")
      .select("token")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.token) {
          setCalUrl(`https://${projectId}.supabase.co/functions/v1/calendar-feed?token=${data.token}`);
        }
      });
  }, [userId, projectId]);

  const generate = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_tokens")
      .upsert({ user_id: userId } as any, { onConflict: "user_id" })
      .select("token")
      .single();

    if (error) {
      toast.error("Не удалось создать ссылку");
    } else if (data) {
      setCalUrl(`https://${projectId}.supabase.co/functions/v1/calendar-feed?token=${data.token}`);
      toast.success("Ссылка создана");
    }
    setLoading(false);
  };

  const regenerate = async () => {
    setLoading(true);
    // Delete and recreate to get a new token
    await supabase.from("calendar_tokens").delete().eq("user_id", userId);
    await generate();
  };

  const copyUrl = async () => {
    if (!calUrl) return;
    await navigator.clipboard.writeText(calUrl);
    setCopied(true);
    toast.success("Ссылка скопирована");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-border pt-6 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarSync className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-medium">Подписка на календарь</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Добавьте ссылку в Google Calendar, Outlook или Apple Calendar — дедлайны задач будут автоматически синхронизироваться.
      </p>

      {calUrl ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={calUrl} readOnly className="text-xs font-mono" />
            <Button variant="outline" size="icon" onClick={copyUrl} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={regenerate} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Пересоздать ссылку
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>📌 <strong>Google Calendar:</strong> Настройки → Добавить по URL → вставить ссылку</p>
            <p>📌 <strong>Outlook:</strong> Добавить календарь → Из интернета → вставить ссылку</p>
            <p>📌 <strong>Apple Calendar:</strong> Файл → Подписка → вставить ссылку</p>
          </div>
        </div>
      ) : (
        <Button onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarSync className="mr-2 h-4 w-4" />}
          Создать ссылку подписки
        </Button>
      )}
    </div>
  );
}
