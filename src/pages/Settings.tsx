import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, MessageCircle, Sun, Moon, Monitor, Palette, Bell, BellOff, Mail, Download, Upload, CalendarSync, Copy, Check, RefreshCw, Tag, ShieldAlert, UserCog, ExternalLink, Building2 } from "lucide-react";
import SmartImportDialog from "@/components/SmartImportDialog";
import TagManagementPanel from "@/components/TagManagementPanel";
import DelegationPanel from "@/components/DelegationPanel";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useTheme, ACCENT_PRESETS } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import TeamSection from "@/components/TeamSection";
import AdminApproval from "@/components/AdminApproval";
import OrgStructurePanel from "@/components/admin/OrgStructurePanel";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { Switch } from "@/components/ui/switch";
import { ConsultantGuard } from "@/components/consultant/ConsultantGuard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Универсальная сворачиваемая секция админки/настроек */
function SettingsSection({
  icon: Icon,
  title,
  description,
  badge,
  defaultOpen = false,
  iconClassName,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  iconClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border pt-6">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-start justify-between gap-3 text-left group"
          >
            <div className="flex items-start gap-2 min-w-0">
              <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", iconClassName ?? "text-primary")} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  {badge}
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground mt-1">{description}</p>
                )}
              </div>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground shrink-0 transition-transform mt-1",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const NOTIFICATION_EVENTS = [
  { push: "push_task_assigned", tg: "telegram_task_assigned", label: "Назначен ответственным" },
  { push: "push_task_delegated", tg: "telegram_task_delegated", label: "Делегирование задачи" },
  { push: "push_task_participant_added", tg: "telegram_task_participant_added", label: "Добавлен участником" },
  { push: "push_task_completed", tg: "telegram_task_completed", label: "Завершение задачи" },
  { push: "push_task_commented", tg: "telegram_task_commented", label: "Новый комментарий" },
  { push: "push_added_to_group", tg: "telegram_added_to_group", label: "Добавление в проект" },
  { push: "push_new_task_in_group", tg: "telegram_new_task_in_group", label: "Новая задача в проекте" },
  { push: "push_deadline_approaching", tg: "telegram_deadline_approaching", label: "Приближение дедлайна" },
] as const;

export default function Settings() {
  const { user, loading, isRealAdmin, adminModeDisabled, setAdminModeDisabled, simulatedRole, setSimulatedRole, isRealConsultant } = useAuth();
  const { mode, setMode, accentColor, setAccentColor } = useTheme();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const { prefs, updatePrefs } = useNotificationPreferences();
  const [telegramUsername, setTelegramUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  
  const [workEmail, setWorkEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [customHue, setCustomHue] = useState(accentColor);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name, telegram_username, work_email, username, organization")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name || "");
          setTelegramUsername((data as any).telegram_username || "");
          setWorkEmail((data as any).work_email || "");
          setOrganization((data as any).organization || "");
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
        organization: organization.trim() || null,
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
      <div className="mx-auto max-w-5xl p-6">
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
                <Label htmlFor="organization">Организация</Label>
                <Input
                  id="organization"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Например: Дороничи"
                />
                <p className="text-xs text-muted-foreground">
                  Используется в протоколах встреч для определения вашей стороны.
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

            {/* Notifications — matrix view, collapsed by default */}
            <SettingsSection
              icon={Bell}
              title="Уведомления"
              description="Включайте каналы (Web Push / Telegram) для каждого события."
              badge={
                prefs ? (
                  <Badge variant="secondary" className="font-normal">
                    {NOTIFICATION_EVENTS.reduce(
                      (acc, e) =>
                        acc + (prefs[e.push as keyof typeof prefs] ? 1 : 0) + (prefs[e.tg as keyof typeof prefs] ? 1 : 0),
                      0,
                    )}{" "}
                    / {NOTIFICATION_EVENTS.length * 2} активно
                  </Badge>
                ) : null
              }
            >
              <div className="space-y-4">
                {pushSupported && (
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
                    {pushSubscribed ? "Отключить Web Push в этом браузере" : "Включить Web Push в этом браузере"}
                  </Button>
                )}

                {prefs && (
                  <>
                    {/* Матрица событий × каналов */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 bg-muted/40 text-xs font-medium text-muted-foreground">
                        <div>Событие</div>
                        <div className="flex items-center gap-1 justify-center w-16">
                          <Bell className="h-3.5 w-3.5" /> Push
                        </div>
                        <div className="flex items-center gap-1 justify-center w-16">
                          <MessageCircle className="h-3.5 w-3.5" /> TG
                        </div>
                      </div>
                      {NOTIFICATION_EVENTS.map((e, idx) => (
                        <div
                          key={e.label}
                          className={cn(
                            "grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2.5 items-center",
                            idx !== NOTIFICATION_EVENTS.length - 1 && "border-b border-border",
                          )}
                        >
                          <span className="text-sm">{e.label}</span>
                          <div className="flex justify-center w-16">
                            <Switch
                              checked={!!prefs[e.push as keyof typeof prefs]}
                              onCheckedChange={(v) => updatePrefs.mutate({ [e.push]: v })}
                            />
                          </div>
                          <div className="flex justify-center w-16">
                            <Switch
                              checked={!!prefs[e.tg as keyof typeof prefs]}
                              onCheckedChange={(v) => updatePrefs.mutate({ [e.tg]: v })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Автоотчёты */}
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Автоотчёты в Telegram</p>
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <span className="text-sm">Еженедельный отчёт</span>
                          <p className="text-xs text-muted-foreground">Пятница в 09:00 МСК — прогресс, просрочки, планы</p>
                        </div>
                        <Switch
                          checked={!!(prefs as any)?.telegram_weekly_report}
                          onCheckedChange={(v) => updatePrefs.mutate({ telegram_weekly_report: v } as any)}
                        />
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <span className="text-sm">Еженедельный ИИ-обзор</span>
                          <p className="text-xs text-muted-foreground">Пятница в 09:00 МСК — ИИ-анализ, достижения, фокус</p>
                        </div>
                        <Switch
                          checked={!!(prefs as any)?.telegram_weekly_ai_review}
                          onCheckedChange={(v) => updatePrefs.mutate({ telegram_weekly_ai_review: v } as any)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>

            {/* Calendar Subscription */}
            <ConsultantGuard area="calendar-sync">
              <SettingsSection
                icon={CalendarSync}
                title="Подписка на календарь"
                description="Синхронизация дедлайнов с Google / Outlook / Apple Calendar."
              >
                <CalendarSubscription userId={user.id} />
              </SettingsSection>
            </ConsultantGuard>

            {/* Tags management */}
            <ConsultantGuard area="tags-management">
              <SettingsSection
                icon={Tag}
                title="Тэги"
                description="Категории и тэги. Фильтрация — через панель фильтров в списке задач."
              >
                <TagManagementPanel />
              </SettingsSection>
            </ConsultantGuard>

            {/* Contractors */}
            <ConsultantGuard area="delegation">
              <SettingsSection
                icon={Users}
                title="Подрядчики"
                description="Внешние исполнители без учётной записи. Используются как метка на задаче."
              >
                <DelegationPanel />
              </SettingsSection>
            </ConsultantGuard>

            {/* Import/Export */}
            <ConsultantGuard area="import-export">
              <SettingsSection
                icon={Download}
                title="Импорт / Экспорт"
                description="Импорт проектов из Excel (.xlsx) — AI определяет колонки автоматически."
              >
                <SmartImportDialog />
              </SettingsSection>
            </ConsultantGuard>

            {/* Teams section */}
            <ConsultantGuard area="teams">
              <SettingsSection
                icon={Users}
                title="Команды"
                description="Совместные пространства и приглашения по invite-коду."
              >
                <TeamSection />
              </SettingsSection>
            </ConsultantGuard>

            {/* Admin mode toggle (только для реальных админов) */}
            {isRealAdmin && (
              <div className="border-t border-border pt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                  <h2 className="text-lg font-medium">Режим администратора</h2>
                </div>
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      Супер-права админа
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Когда включены — видно всё (чужие задачи, проекты, теги, панель утверждения пользователей).
                      Выключите, чтобы интерфейс выглядел как у обычного юзера.
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Статус: <span className={cn("font-semibold", adminModeDisabled ? "text-muted-foreground" : "text-destructive")}>
                        {adminModeDisabled ? "Выключен" : "Включен"}
                      </span>
                    </p>
                  </div>
                  <Switch
                    checked={!adminModeDisabled}
                    onCheckedChange={(checked) => {
                      setAdminModeDisabled(!checked);
                      toast.success(checked ? "Админ-режим включён" : "Админ-режим выключен");
                    }}
                  />
                </div>

                {/* Симуляция роли (только визуально). RLS на сервере не меняется. */}
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium text-foreground">Симуляция роли</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Переключает интерфейс в режим внешнего пользователя (consultant) или сотрудника —
                        чтобы проверить, как выглядят все ограничения. Это <span className="font-medium">только визуальная</span>{" "}
                        симуляция: серверные права (RLS, edge-функции) не меняются.
                      </p>
                      {isRealConsultant && (
                        <p className="text-xs text-destructive mt-1">
                          Учётка имеет реальную роль consultant — симуляция «сотрудник» не вернёт серверный доступ.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: null, label: "Без симуляции" },
                      { value: "employee", label: "Сотрудник" },
                      { value: "consultant", label: "Consultant" },
                    ] as const).map((opt) => {
                      const active = simulatedRole === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => {
                            setSimulatedRole(opt.value);
                            toast.success(
                              opt.value === null
                                ? "Симуляция отключена"
                                : `Симулируем: ${opt.label}`,
                            );
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-border hover:bg-accent",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {simulatedRole && (
                    <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Активна симуляция «{simulatedRole === "consultant" ? "Consultant" : "Сотрудник"}». Все areas обновлены вживую.
                      </p>
                      <Link
                        to="/dev/consultant-areas"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        Открыть реестр <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Admin: Org structure + User management */}
            <ConsultantGuard area="admin">
              {isRealAdmin && (
                <SettingsSection
                  icon={Building2}
                  title="Оргструктура"
                  description="Дирекция → Отдел → Подотдел. Руководители (head) и замы."
                >
                  <OrgStructurePanel />
                </SettingsSection>
              )}
              <SettingsSection
                icon={UserCog}
                title="Управление пользователями"
                description="Утверждение, назначение отделов, доп. отделы и роли."
              >
                <AdminApproval />
              </SettingsSection>
            </ConsultantGuard>
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
