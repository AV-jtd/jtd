import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Phone, Mail, MapPin, User as UserIcon, CheckCircle2, AlertTriangle,
  ListTodo, ExternalLink, Camera, Loader2, Pencil, Check, X, MessageSquare,
  FileText, Handshake, Wallet, FolderArchive, History, Tags, StickyNote, GitBranch, Globe,
} from "lucide-react";
import ClientAvatar from "@/components/ClientAvatar";
import ClientTeamManager from "@/components/ClientTeamManager";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";

type EditableField = "contact_name" | "phone" | "email" | "city" | "website";

type ClientFields = {
  id: string;
  name: string;
  logo_url: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  website: string | null;
  rankLabel: string | null;
  territoryLabel: string | null;
  retailLabel: string | null;
};

type FunnelInfo = { taskId: string; stage: string | null; progress: number } | null;
type ActivityItem = { id: string; content: string; author: string; createdAt: string };
type ProtocolItem = { id: string; name: string; date: string | null };

type ClientCtx = {
  client: ClientFields | null;
  managerName: string | null;
  team: { id: string; name: string; role: string | null }[];
  tasks: { id: string; title: string; is_completed: boolean; deadline: string | null }[];
  groupId: string | null;
  funnel: FunnelInfo;
  activity: ActivityItem[];
  protocols: ProtocolItem[];
};

const EMPTY: ClientCtx = {
  client: null, managerName: null, team: [], tasks: [],
  groupId: null, funnel: null, activity: [], protocols: [],
};

function useClientContext(clientId: string | null) {
  return useQuery({
    queryKey: ["client_context", clientId],
    queryFn: async (): Promise<ClientCtx> => {
      if (!clientId) return EMPTY;
      const { data: c } = await supabase
        .from("clients")
        .select("id, name, logo_url, contact_name, phone, email, city, website, manager_id, rank_tag_id, territory_tag_id, retail_type_tag_id")
        .eq("id", clientId)
        .maybeSingle();
      if (!c) return EMPTY;

      const tagIds = [c.rank_tag_id, c.territory_tag_id, c.retail_type_tag_id].filter(Boolean) as string[];
      const tagMap = new Map<string, string>();
      if (tagIds.length) {
        const { data: tags } = await supabase.from("tags").select("id, name").in("id", tagIds);
        for (const t of (tags as any[]) || []) tagMap.set(t.id, t.name);
      }

      // Команда по клиенту
      const { data: assigns } = await supabase
        .from("client_assignments")
        .select("manager_id, notes")
        .eq("client_id", clientId);

      // Задачи клиента
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, task_type, source_protocol_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      const tasks = (tasksData as any[]) || [];

      // Протоколы, напрямую помеченные этим клиентом (protocol_meta.client_id)
      const { data: directProtos } = await supabase
        .from("task_groups")
        .select("id, name, created_at, protocol_meta")
        .eq("project_type", "protocol" as any)
        .eq("protocol_meta->>client_id", clientId as any)
        .order("created_at", { ascending: false });
      const directProtocols = (directProtos as any[]) || [];

      // Задачи из напрямую привязанных протоколов — чтобы они тоже сразу появлялись
      if (directProtocols.length) {
        const directGroupIds = directProtocols.map((p) => p.id);
        const { data: protoTasks } = await supabase
          .from("tasks")
          .select("id, title, is_completed, deadline, task_type, source_protocol_id")
          .in("group_id", directGroupIds)
          .neq("task_type", "protocol_review")
          .order("created_at", { ascending: false })
          .limit(200);
        const seen = new Set(tasks.map((t) => t.id));
        for (const t of (protoTasks as any[]) || []) {
          if (!seen.has(t.id)) { tasks.push(t); seen.add(t.id); }
        }
      }

      // CRM-комната клиента (для ленты активности)
      const { data: room } = await supabase
        .from("task_groups")
        .select("id")
        .eq("project_type", "crm_client" as any)
        .eq("client_id", clientId as any)
        .maybeSingle();
      const groupId = (room as any)?.id ?? null;

      // Этап воронки — из шагов CRM-задачи воронки
      let funnel: FunnelInfo = null;
      const funnelTask = tasks.find((t) => t.task_type === "crm");
      if (funnelTask) {
        const { data: steps } = await supabase
          .from("subtasks")
          .select("title, is_completed, position")
          .eq("task_id", funnelTask.id)
          .order("position", { ascending: true });
        const list = (steps as any[]) || [];
        const done = list.filter((s) => s.is_completed).length;
        const current = list.find((s) => !s.is_completed);
        funnel = {
          taskId: funnelTask.id,
          stage: current?.title ?? (list.length ? "Завершена" : null),
          progress: list.length ? Math.round((done / list.length) * 100) : 0,
        };
      }

      // Лента активности — сообщения CRM-комнаты
      let activity: ActivityItem[] = [];
      const activityAuthorIds = new Set<string>();
      let rawMsgs: any[] = [];
      if (groupId) {
        const { data: msgs } = await supabase
          .from("group_messages")
          .select("id, content, created_at, user_id, external_author")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(6);
        rawMsgs = ((msgs as any[]) || []).filter((m) => (m.content || "").trim().length > 0);
        for (const m of rawMsgs) if (m.user_id) activityAuthorIds.add(m.user_id);
      }

      // Протоколы/встречи: напрямую привязанные + производные от source_protocol_id задач
      const protocolMap = new Map<string, ProtocolItem>();
      for (const p of directProtocols) {
        protocolMap.set(p.id, { id: p.id, name: p.name, date: p.created_at });
      }
      const derivedIds = [...new Set(tasks.map((t) => t.source_protocol_id).filter(Boolean))]
        .filter((id) => !protocolMap.has(id as string)) as string[];
      if (derivedIds.length) {
        const { data: protos } = await supabase
          .from("task_groups")
          .select("id, name, created_at")
          .in("id", derivedIds);
        for (const p of (protos as any[]) || []) {
          if (!protocolMap.has(p.id)) protocolMap.set(p.id, { id: p.id, name: p.name, date: p.created_at });
        }
      }
      const protocols: ProtocolItem[] = [...protocolMap.values()];

      // Единый словарь профилей: ответственные + команда + авторы ленты
      const managerIds = [
        ...new Set([
          c.manager_id,
          ...((assigns as any[]) || []).map((a) => a.manager_id),
          ...activityAuthorIds,
        ].filter(Boolean)),
      ] as string[];
      const profMap = new Map<string, string>();
      if (managerIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", managerIds);
        for (const p of (profs as any[]) || []) profMap.set(p.id, p.display_name || p.email || "—");
      }
      const team = ((assigns as any[]) || [])
        .filter((a) => a.manager_id)
        .map((a) => ({ id: a.manager_id, name: profMap.get(a.manager_id) || "—", role: a.notes || null }));

      activity = rawMsgs.map((m) => ({
        id: m.id,
        content: m.content || "",
        author: (m.user_id ? profMap.get(m.user_id) : null) || m.external_author || "—",
        createdAt: m.created_at,
      }));

      return {
        client: {
          id: c.id,
          name: c.name,
          logo_url: c.logo_url,
          contact_name: c.contact_name,
          phone: c.phone,
          email: c.email,
          city: c.city,
          website: (c as any).website ?? null,
          rankLabel: c.rank_tag_id ? tagMap.get(c.rank_tag_id) ?? null : null,
          territoryLabel: c.territory_tag_id ? tagMap.get(c.territory_tag_id) ?? null : null,
          retailLabel: c.retail_type_tag_id ? tagMap.get(c.retail_type_tag_id) ?? null : null,
        },
        managerName: c.manager_id ? profMap.get(c.manager_id) ?? null : null,
        team,
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, is_completed: t.is_completed, deadline: t.deadline })),
        groupId,
        funnel,
        activity,
        protocols,
      };
    },
    enabled: !!clientId,
    staleTime: 1000 * 60,
  });
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <div className={cn("flex items-center gap-1.5 text-[10px] font-medium", tone)}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold leading-none">{value}</div>
    </div>
  );
}

/** Заголовок секции карточки. */
function SectionTitle({ icon: Icon, children, soon }: { icon: any; children: React.ReactNode; soon?: boolean }) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
      <Icon className="h-3 w-3" /> {children}
      {soon && (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium normal-case text-muted-foreground/70">
          скоро
        </span>
      )}
    </h4>
  );
}

/** Инлайн-редактируемая строка контакта. */
function EditableContactRow({
  icon: Icon,
  value,
  placeholder,
  href,
  type = "text",
  onSave,
}: {
  icon: any;
  value: string | null;
  placeholder: string;
  href?: string;
  type?: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  const begin = () => { setDraft(value ?? ""); setEditing(true); };
  const commit = async () => {
    const next = draft.trim() || null;
    if (next === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(next); setEditing(false); } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:border-primary/50"
        />
        <button onClick={commit} disabled={saving} className="shrink-0 rounded p-0.5 text-tag-green hover:bg-muted" aria-label="Сохранить">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setEditing(false)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Отмена">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {value ? (
        href ? (
          <a
            href={href}
            target={/^https?:\/\//i.test(href) ? "_blank" : undefined}
            rel={/^https?:\/\//i.test(href) ? "noreferrer" : undefined}
            className="truncate text-muted-foreground hover:text-foreground"
          >{value}</a>
        ) : (
          <span className="truncate text-muted-foreground">{value}</span>
        )
      ) : (
        <button onClick={begin} className="truncate text-left text-muted-foreground/50 italic hover:text-foreground">
          {placeholder}
        </button>
      )}
      <button
        onClick={begin}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors hover:bg-muted group-hover:text-muted-foreground"
        aria-label="Редактировать"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ClientContextPanel({
  clientId,
  onNavigateToTask,
}: {
  clientId: string | null;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const { data, isLoading } = useClientContext(clientId);
  const client = data?.client;
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client_context", clientId] });
    qc.invalidateQueries({ queryKey: ["client_room_info", clientId] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["crm_clients"] });
    qc.invalidateQueries({ queryKey: ["chat_rooms"] });
  };

  const saveField = async (field: EditableField, value: string | null) => {
    if (!clientId) return;
    const { error } = await supabase.from("clients").update({ [field]: value } as any).eq("id", clientId);
    if (error) { toast.error("Не удалось сохранить: " + error.message); throw error; }
    invalidate();
  };

  const handleLogoUpload = async (file: File) => {
    if (!clientId || !user) return;
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/client-${clientId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("protocol-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("protocol-logos").getPublicUrl(path);
      const { data: updated, error } = await supabase
        .from("clients")
        .update({ logo_url: publicUrl } as any)
        .eq("id", clientId)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("нет прав на изменение карточки клиента");
      invalidate();
      toast.success("Логотип обновлён");
    } catch (e: any) {
      toast.error("Ошибка загрузки: " + (e?.message || "не удалось"));
    } finally {
      setUploading(false);
    }
  };

  if (!clientId) return null;

  if (isLoading || !client) {
    return (
      <div className="flex h-full items-center justify-center bg-card text-xs text-muted-foreground">
        {isLoading ? "Загрузка…" : "Клиент не найден"}
      </div>
    );
  }

  const open = data!.tasks.filter((t) => !t.is_completed);
  const completed = data!.tasks.filter((t) => t.is_completed);
  const now = Date.now();
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);

  return (
    <div className="flex h-full flex-col bg-card">
      <ScrollArea className="flex-1 [&>div>div]:!block">
        <div className="space-y-4 p-4">
          {/* Карточка клиента */}
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <ClientAvatar client={client} size="lg" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                title="Сменить логотип"
                aria-label="Сменить логотип"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.currentTarget.value = ""; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{client.name}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {client.rankLabel && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {client.rankLabel}
                  </span>
                )}
                {client.territoryLabel && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {client.territoryLabel}
                  </span>
                )}
                {client.retailLabel && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {client.retailLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Контакты (инлайн-редактирование) */}
          <div className="space-y-1.5">
            <EditableContactRow
              icon={UserIcon}
              value={client.contact_name}
              placeholder="Контактное лицо"
              onSave={(v) => saveField("contact_name", v)}
            />
            <EditableContactRow
              icon={Phone}
              value={client.phone}
              placeholder="Телефон"
              type="tel"
              href={client.phone ? `tel:${client.phone}` : undefined}
              onSave={(v) => saveField("phone", v)}
            />
            <EditableContactRow
              icon={Mail}
              value={client.email}
              placeholder="Email"
              type="email"
              href={client.email ? `mailto:${client.email}` : undefined}
              onSave={(v) => saveField("email", v)}
            />
            <EditableContactRow
              icon={MapPin}
              value={client.city}
              placeholder="Город"
              onSave={(v) => saveField("city", v)}
            />
            <EditableContactRow
              icon={Globe}
              value={client.website}
              placeholder="Ссылка / сайт"
              type="url"
              href={client.website ? (/^https?:\/\//i.test(client.website) ? client.website : `https://${client.website}`) : undefined}
              onSave={(v) => saveField("website", v)}
            />
          </div>

          {/* Этап воронки */}
          {data!.funnel && data!.funnel.stage && (
            <button
              onClick={() => onNavigateToTask?.(data!.funnel!.taskId)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted"
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase text-muted-foreground">Этап воронки</div>
                <div className="truncate text-xs font-medium">{data!.funnel.stage}</div>
              </div>
              <span className="shrink-0 text-xs font-bold text-primary">{data!.funnel.progress}%</span>
            </button>
          )}

          {/* KPI */}
          <div className="grid grid-cols-3 gap-2">
            <Kpi icon={ListTodo} label="В работе" value={open.length} tone="text-tag-blue" />
            <Kpi icon={AlertTriangle} label="Просрочено" value={overdue.length} tone="text-destructive" />
            <Kpi icon={CheckCircle2} label="Готово" value={completed.length} tone="text-tag-green" />
          </div>

          {/* Команда */}
          {data!.client && (
            <ClientTeamManager clientId={data!.client.id} managerName={data!.managerName} />
          )}

          {/* Ключевые задачи */}
          {open.length > 0 && (
            <div>
              <SectionTitle icon={ListTodo}>Ключевые задачи</SectionTitle>
              <div className="space-y-1">
                {open.slice(0, 8).map((t) => {
                  const isOverdue = t.deadline && new Date(t.deadline).getTime() < now;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onNavigateToTask?.(t.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isOverdue ? "bg-destructive" : "bg-tag-blue")} />
                      <span className="truncate">{t.title}</span>
                      <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Протоколы / встречи (производные от source_protocol_id) */}
          <div>
            <SectionTitle icon={FileText}>Протоколы и встречи</SectionTitle>
            {data!.protocols.length > 0 ? (
              <div className="space-y-1">
                {data!.protocols.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/protocols/${p.id}`)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                    title="Открыть протокол"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                    {p.date && (
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(p.date), { locale: ru, addSuffix: true })}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                Пока нет встреч по клиенту
              </p>
            )}
          </div>

          {/* Лента активности — сообщения CRM-комнаты */}
          {data!.activity.length > 0 && (
            <div>
              <SectionTitle icon={MessageSquare}>Лента активности</SectionTitle>
              <div className="space-y-2">
                {data!.activity.map((a) => (
                  <div key={a.id} className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-foreground/80">{a.author}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(a.createdAt), { locale: ru })}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">{a.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Плейсхолдеры на будущее */}
          <div className="space-y-3 border-t border-dashed border-border pt-3">
            {([
              { icon: Handshake, label: "Контактные лица и роли", hint: "ЛПР, закупщик, категорийный менеджер" },
              { icon: Wallet, label: "Сделки и выручка", hint: "Воронка по деньгам, план-факт" },
              { icon: FolderArchive, label: "Документы", hint: "Договоры, презентации, файлы" },
              { icon: History, label: "История взаимодействий", hint: "Звонки, письма, визиты" },
              { icon: Tags, label: "Бренды и категории", hint: "Связанные SKU и продукты" },
              { icon: StickyNote, label: "Заметки", hint: "Внутренние комментарии по клиенту" },
            ] as const).map((s) => (
              <div key={s.label} className="flex items-start gap-2 opacity-60">
                <s.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    {s.label}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground/70">скоро</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">{s.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
