import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Save, MessageCircle, Sun, Moon, Monitor, Palette, Bell, BellOff, Mail, Download, CalendarSync, Copy, Check, RefreshCw, Tag, ShieldAlert, UserCog, ExternalLink, Building2, Users, Search, X, KeyRound } from "lucide-react";
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
import MaxLinkCard from "@/components/MaxLinkCard";
import { ConsultantGuard } from "@/components/consultant/ConsultantGuard";
import ChangePasswordSection from "@/components/settings/ChangePasswordSection";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Универсальная сворачиваемая секция админки/настроек — компактная карточка */
function SettingsSection({
  icon: Icon,
  title,
  description,
  badge,
  defaultOpen = false,
  iconClassName,
  sectionId,
  forceOpen,
  hidden,
  registerRef,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  iconClassName?: string;
  sectionId?: string;
  /** Принудительно раскрыть (например, при поиске или клике по якорю) */
  forceOpen?: boolean;
  /** Скрыть секцию (поиск не нашёл совпадений) */
  hidden?: boolean;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const localRef = useRef<HTMLDivElement | null>(null);

  // Следим за forceOpen: при включении — раскрываем, при выключении — оставляем как есть
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (sectionId && registerRef) {
      registerRef(sectionId, localRef.current);
      return () => registerRef(sectionId, null);
    }
  }, [sectionId, registerRef]);

  if (hidden) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-lg border border-border bg-card transition-colors",
        open && "shadow-sm",
      )}
    >
      <div ref={localRef} aria-hidden className="-mt-16 pt-16" />
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 text-left px-4 py-3 hover:bg-accent/40 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Icon className={cn("h-4 w-4 shrink-0", iconClassName ?? "text-primary")} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{title}</span>
                {badge}
              </div>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-1 border-t border-border">
        <div className="pt-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const NOTIFICATION_EVENTS = [
  { push: "push_task_assigned", tg: "telegram_task_assigned", label: "Назначен ответственным" },
  { push: "push_task_delegated", tg: "telegram_task_delegated", label: "Делегирование задачи" },
  { push: "push_task_participant_added", tg: "telegram_task_participant_added", label: "Добавлен участником" },
  { push: "push_task_completed", tg: "telegram_task_completed", label: "Завершение задачи" },
  { push: "push_task_commented", tg: "telegram_task_commented", label: "Новый комментарий" },
  { push: "push_user_mentioned", tg: "telegram_user_mentioned", label: "Меня упомянули в чате (@)" },
  { push: "push_added_to_group", tg: "telegram_added_to_group", label: "Добавление в проект" },
  { push: "push_new_task_in_group", tg: "telegram_new_task_in_group", label: "Новая задача в проекте" },
  { push: "push_deadline_approaching", tg: "telegram_deadline_approaching", label: "Приближение дедлайна" },
] as const;

/** Метаданные секций для поиска и навигации-якорей */
type SectionMeta = {
  id: string;
  label: string;
  /** Дополнительные ключевые слова для поиска */
  keywords?: string;
};

const SECTION_META: Record<string, SectionMeta> = {
  profile:        { id: "profile",        label: "Профиль",     keywords: "имя организация email telegram" },
  security:       { id: "security",       label: "Пароль",      keywords: "пароль безопасность смена сменить password" },
  appearance:     { id: "appearance",     label: "Оформление",  keywords: "тема цвет акцент темная светлая палитра" },
  notifications:  { id: "notifications",  label: "Уведомления", keywords: "push web telegram бот матрица отчёт" },
  max_channel:    { id: "max_channel",    label: "MAX",         keywords: "max мессенджер бот уведомления канал альтернатива" },
  calendar:       { id: "calendar",       label: "Календарь",   keywords: "google outlook apple ics подписка" },
  tags:           { id: "tags",           label: "Тэги",        keywords: "категории фильтры" },
  contractors:    { id: "contractors",    label: "Подрядчики",  keywords: "внешние делегирование" },
  ie:             { id: "ie",             label: "Импорт/Экспорт", keywords: "excel xlsx ai импортировать выгрузка" },
  teams:          { id: "teams",          label: "Команды",     keywords: "приглашение invite" },
  admin_mode:     { id: "admin_mode",     label: "Админ-режим", keywords: "права супер админ симуляция" },
  org:            { id: "org",            label: "Оргструктура",keywords: "дирекция отдел подотдел руководитель зам" },
  users:          { id: "users",          label: "Пользователи",keywords: "утверждение роли отделы" },
};

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

  // ===== Поиск по настройкам и якорная навигация =====
  const [search, setSearch] = useState("");
  const sectionRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  }, []);

  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ё/g, "е")
      .trim();

  const matches = useCallback(
    (id: string, title: string, description?: string) => {
      const q = norm(search);
      if (!q) return true;
      const meta = SECTION_META[id];
      const haystack = norm(
        [title, description ?? "", meta?.label ?? "", meta?.keywords ?? ""].join(" "),
      );
      return haystack.includes(q);
    },
    [search],
  );

  const isSearching = search.trim().length > 0;

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад к задачам
        </Link>

        <h1 className="text-xl font-semibold text-foreground mb-3">Настройки</h1>

        {/* Sticky шапка с поиском и якорями */}
        <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-2 mb-3 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border">
          {/* Mobile: админ-пилюля над поиском */}
          {isRealAdmin && (
            <div className="sm:hidden mb-2">
              <AdminModePill
                adminModeDisabled={adminModeDisabled}
                setAdminModeDisabled={setAdminModeDisabled}
                simulatedRole={simulatedRole}
                onJump={() => scrollToSection("admin_mode")}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по настройкам…"
                className="h-8 pl-8 pr-8 text-xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Очистить поиск"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {/* Desktop: админ-пилюля справа от поиска */}
            {isRealAdmin && (
              <div className="hidden sm:block shrink-0">
                <AdminModePill
                  adminModeDisabled={adminModeDisabled}
                  setAdminModeDisabled={setAdminModeDisabled}
                  simulatedRole={simulatedRole}
                  onJump={() => scrollToSection("admin_mode")}
                />
              </div>
            )}
          </div>

          {/* Якоря — горизонтальный скролл на мобильном */}
          {!isSearching && (
            <div className="mt-2 -mx-1 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1 px-1">
                {Object.values(SECTION_META).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => scrollToSection(m.id)}
                    className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {loadingProfile ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Profile — сворачиваемая, открыта по умолчанию */}
            <SettingsSection
              icon={UserCog}
              title="Профиль"
              description={`${displayName || "Без имени"}${organization ? " · " + organization : ""}`}
              defaultOpen
              sectionId="profile"
              registerRef={registerRef}
              forceOpen={isSearching}
              hidden={!matches("profile", "Профиль", `${displayName} ${organization} ${workEmail} ${telegramUsername}`)}
            >
              <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label htmlFor="displayName" className="text-xs">Имя</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ваше имя"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="organization" className="text-xs">Организация</Label>
                  <Input
                    id="organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="Например: Дороничи"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="workEmail" className="text-xs flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    Рабочий email
                  </Label>
                  <Input
                    id="workEmail"
                    type="email"
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    placeholder="work@company.com"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telegram" className="text-xs flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Telegram
                  </Label>
                  <Input
                    id="telegram"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    placeholder="username (без @)"
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-muted-foreground line-clamp-2 flex-1">
                  Email и Telegram — для задач из почты и бота. Организация — для протоколов.
                </p>
                <Button onClick={handleSave} disabled={saving} size="sm" className="shrink-0">
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Сохранить
                </Button>
              </div>
              </div>
            </SettingsSection>

            {/* Theme section — сворачиваемая, открыта по умолчанию */}
            <SettingsSection
              icon={Palette}
              title="Оформление"
              description={`${mode === "light" ? "Светлая" : mode === "dark" ? "Тёмная" : "Системная"} тема`}
              defaultOpen
              sectionId="appearance"
              registerRef={registerRef}
              forceOpen={isSearching}
              hidden={!matches("appearance", "Оформление", "тема цвет акцент")}
            >
              <div className="space-y-3">
              {/* Light/Dark/System */}
              <div className="space-y-1.5">
                <Label className="text-xs">Тема</Label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {themeModes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setMode(t.id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                        mode === t.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent: пресеты + слайдер в одной строке (на десктопе) */}
              <div className="space-y-1.5">
                <Label className="text-xs">Цвет акцента</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_PRESETS.map(p => (
                    <button
                      key={p.hue}
                      onClick={() => { setAccentColor(p.hue); setCustomHue(p.hue); }}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-all",
                        accentColor === p.hue ? "border-foreground scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: `hsl(${p.hue}, 91%, 60%)` }}
                      title={p.name}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={customHue}
                    onChange={(e) => {
                      setCustomHue(e.target.value);
                      setAccentColor(e.target.value);
                    }}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: "linear-gradient(to right, hsl(0,91%,60%), hsl(60,91%,60%), hsl(120,91%,60%), hsl(180,91%,60%), hsl(240,91%,60%), hsl(300,91%,60%), hsl(360,91%,60%))",
                    }}
                  />
                  <div
                    className="h-6 w-6 rounded-full border border-border shrink-0"
                    style={{ backgroundColor: `hsl(${customHue}, 91%, 60%)` }}
                  />
                </div>
              </div>
              </div>
            </SettingsSection>

            {/* Смена пароля */}
            <SettingsSection
              icon={KeyRound}
              title="Пароль"
              description="Смена пароля от аккаунта"
              sectionId="security"
              registerRef={registerRef}
              forceOpen={isSearching}
              hidden={!matches("security", "Пароль", "пароль безопасность смена сменить password")}
            >
              <ChangePasswordSection />
            </SettingsSection>

            {/* Notifications — matrix view, collapsed by default */}
            <SettingsSection
              icon={Bell}
              title="Уведомления"
              description="Включайте каналы (Web Push / Telegram) для каждого события."
              sectionId="notifications"
              registerRef={registerRef}
              forceOpen={isSearching}
              hidden={!matches("notifications", "Уведомления", "push web telegram бот матрица отчёт")}
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
                      <div className="flex items-center justify-between py-2 border-b border-border">
                        <div>
                          <span className="text-sm">Сообщения из чата проекта</span>
                          <p className="text-xs text-muted-foreground">Дублировать в личку каждое новое сообщение из чатов проектов, в которых вы участвуете</p>
                        </div>
                        <Switch
                          checked={!!(prefs as any)?.telegram_group_chat_message}
                          onCheckedChange={(v) => updatePrefs.mutate({ telegram_group_chat_message: v } as any)}
                        />
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <span className="text-sm">Еженедельный отчёт</span>
                          <p className="text-xs text-muted-foreground">Пятница в 08:08 МСК — цифры, просрочки, планы + ИИ-обзор</p>
                        </div>
                        <Switch
                          checked={!!(prefs as any)?.telegram_weekly_report}
                          onCheckedChange={(v) => updatePrefs.mutate({ telegram_weekly_report: v } as any)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </SettingsSection>

            {/* MAX messenger — second channel alongside Telegram (not a replacement) */}
            <SettingsSection
              icon={MessageCircle}
              title="MAX"
              description="Альтернативный канал рядом с Telegram: бот и уведомления в MAX."
              sectionId="max_channel"
              registerRef={registerRef}
              forceOpen={isSearching}
              hidden={!matches("max_channel", "MAX", "max мессенджер бот уведомления канал альтернатива")}
            >
              <MaxLinkCard />
            </SettingsSection>

            {/* Calendar Subscription */}
            <ConsultantGuard area="calendar-sync">
              <SettingsSection
                icon={CalendarSync}
                title="Подписка на календарь"
                description="Синхронизация дедлайнов с Google / Outlook / Apple Calendar."
                sectionId="calendar"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("calendar", "Подписка на календарь", "google outlook apple ics")}
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
                sectionId="tags"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("tags", "Тэги", "категории фильтры")}
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
                sectionId="contractors"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("contractors", "Подрядчики", "внешние делегирование")}
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
                sectionId="ie"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("ie", "Импорт / Экспорт", "excel xlsx ai")}
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
                sectionId="teams"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("teams", "Команды", "приглашение invite")}
              >
                <TeamSection />
              </SettingsSection>
            </ConsultantGuard>

            {/* Admin mode toggle (только для реальных админов) */}
            {isRealAdmin && (
              <SettingsSection
                icon={ShieldAlert}
                iconClassName="text-destructive"
                title="Режим администратора"
                description={`Супер-права: ${adminModeDisabled ? "выключены" : "включены"}${simulatedRole ? ` · симуляция: ${simulatedRole === "consultant" ? "Consultant" : "Сотрудник"}` : ""}`}
                sectionId="admin_mode"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("admin_mode", "Режим администратора", "права супер симуляция")}
              >
                <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Тумблер «Супер-права» вынесен в шапку страницы — переключайте оттуда. Когда права включены —
                  видно всё (чужие задачи, проекты, теги, панель утверждения пользователей). Выключите, чтобы интерфейс
                  выглядел как у обычного юзера.
                </p>

                {/* Симуляция роли (только визуально). RLS на сервере не меняется. */}
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
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
              </SettingsSection>
            )}

            {/* Admin: Org structure + User management */}
            <ConsultantGuard area="admin">
              {isRealAdmin && (
                <SettingsSection
                  icon={Building2}
                  title="Оргструктура"
                  description="Дирекция → Отдел → Подотдел. Руководители и замы."
                  sectionId="org"
                  registerRef={registerRef}
                  forceOpen={isSearching}
                  hidden={!matches("org", "Оргструктура", "дирекция отдел подотдел руководитель зам")}
                >
                  <OrgStructurePanel />
                </SettingsSection>
              )}
              <SettingsSection
                icon={UserCog}
                title="Управление пользователями"
                description="Утверждение, назначение отделов, доп. отделы и роли."
                sectionId="users"
                registerRef={registerRef}
                forceOpen={isSearching}
                hidden={!matches("users", "Управление пользователями", "утверждение роли отделы")}
              >
                <AdminApproval />
              </SettingsSection>
            </ConsultantGuard>

            {/* Empty state for search */}
            {isSearching && (
              <SearchEmptyState
                anyVisible={
                  matches("profile", "Профиль", `${displayName} ${organization} ${workEmail} ${telegramUsername}`) ||
                  matches("appearance", "Оформление", "тема цвет акцент") ||
                  matches("notifications", "Уведомления", "push web telegram бот матрица отчёт") ||
                  matches("max_channel", "MAX", "max мессенджер бот уведомления канал альтернатива") ||
                  matches("calendar", "Подписка на календарь", "google outlook apple ics") ||
                  matches("tags", "Тэги", "категории фильтры") ||
                  matches("contractors", "Подрядчики", "внешние делегирование") ||
                  matches("ie", "Импорт / Экспорт", "excel xlsx ai") ||
                  matches("teams", "Команды", "приглашение invite") ||
                  (isRealAdmin && matches("admin_mode", "Режим администратора", "права супер симуляция")) ||
                  (isRealAdmin && matches("org", "Оргструктура", "дирекция отдел подотдел руководитель зам")) ||
                  matches("users", "Управление пользователями", "утверждение роли отделы")
                }
                onReset={() => setSearch("")}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchEmptyState({ anyVisible, onReset }: { anyVisible: boolean; onReset: () => void }) {
  if (anyVisible) return null;
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-10 text-center">
      <Search className="mx-auto h-5 w-5 text-muted-foreground mb-2" />
      <p className="text-sm text-foreground">Ничего не найдено</p>
      <p className="text-xs text-muted-foreground mt-1">Попробуйте другой запрос или сбросьте поиск.</p>
      <Button variant="ghost" size="sm" className="mt-3" onClick={onReset}>
        <X className="mr-1.5 h-3.5 w-3.5" /> Сбросить
      </Button>
    </div>
  );
}

/**
 * Компактная пилюля «Админ-режим» для шапки настроек.
 * Показывает текущий статус супер-прав и активную симуляцию роли.
 * Тумблер мгновенно переключает права. Клик по статусу/иконке — скролл к секции с подробностями.
 */
function AdminModePill({
  adminModeDisabled,
  setAdminModeDisabled,
  simulatedRole,
  onJump,
}: {
  adminModeDisabled: boolean;
  setAdminModeDisabled: (v: boolean) => void;
  simulatedRole: "employee" | "consultant" | null;
  onJump: () => void;
}) {
  const active = !adminModeDisabled;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border pl-2 pr-1 py-0.5 transition-colors",
        active
          ? "border-destructive/40 bg-destructive/10"
          : "border-border bg-muted/40",
      )}
      title="Режим администратора"
    >
      <button
        type="button"
        onClick={onJump}
        className="flex items-center gap-1.5 text-[11px] font-medium hover:opacity-80 transition-opacity"
      >
        <ShieldAlert
          className={cn(
            "h-3.5 w-3.5",
            active ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className={cn(active ? "text-destructive" : "text-muted-foreground")}>
          Админ
        </span>
        {simulatedRole && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal ml-0.5">
            {simulatedRole === "consultant" ? "Consultant" : "Сотрудник"}
          </Badge>
        )}
      </button>
      <Switch
        checked={active}
        onCheckedChange={(checked) => {
          setAdminModeDisabled(!checked);
          toast.success(checked ? "Админ-режим включён" : "Админ-режим выключен");
        }}
        className="scale-75 origin-right"
        aria-label="Переключить супер-права админа"
      />
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
    <div className="space-y-4">
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
