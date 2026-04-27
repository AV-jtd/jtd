import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAvailableUsers } from "@/hooks/useTasks";
import UserPicker from "@/components/UserPicker";
import MultiAssigneePicker from "@/components/MultiAssigneePicker";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Pencil,
  Plus,
  Users,
  Wifi,
  WifiOff,
  X,
  Building2,
  Link2,
  Unlink,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getInitials } from "@/lib/initials";
import { parseProtocolSides, namesEqual } from "@/lib/protocolSides";
import ourLogoDefault from "@/assets/our-logo-default.jpg";

type Format = "online" | "offline" | "hybrid";

interface ExternalAttendee {
  name: string;
  organization?: string;
  role?: string;
}

interface ProtocolMeta {
  meeting_date?: string;
  format?: Format;
  external_attendees?: ExternalAttendee[];
  client_id?: string | null;
  our_logo_url?: string | null;
  our_side_name?: string | null;
  /** Manually added internal attendees (user ids) — independent from task assignees */
  internal_attendees?: string[];
  /** User ids excluded from the auto-derived list (task assignees) */
  internal_excluded?: string[];
}

interface CrmClient {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  logo_url?: string | null;
}

interface Props {
  protocol: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    logo_url?: string | null;
    protocol_meta?: ProtocolMeta | null;
    user_id: string;
  };
  isDraft: boolean;
  internalAttendeeIds?: string[];
  /** Cross-functional internal ritual: hide partner / format / axes blocks */
  isCrossFunctional?: boolean;
}

const FORMAT_LABEL: Record<Format, { label: string; icon: typeof Wifi }> = {
  online: { label: "Онлайн", icon: Wifi },
  offline: { label: "Офлайн", icon: Users },
  hybrid: { label: "Гибрид", icon: WifiOff },
};

export default function ProtocolHeader({ protocol, isDraft, internalAttendeeIds = [], isCrossFunctional = false }: Props) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useAvailableUsers();
  const meta: ProtocolMeta = protocol.protocol_meta ?? {};
  const fmt: Format = meta.format ?? "offline";
  const FmtIcon = FORMAT_LABEL[fmt].icon;

  // ---- title editing ----
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(protocol.name);
  useEffect(() => setTitleVal(protocol.name), [protocol.name]);

  // ---- generic update mutation ----
  const update = useMutation({
    mutationFn: async (patch: Partial<{ name: string; icon: string; logo_url: string | null; protocol_meta: ProtocolMeta }>) => {
      const { error } = await supabase.from("task_groups").update(patch as any).eq("id", protocol.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_groups"] });
    },
    onError: (e: Error) => toast.error("Не удалось сохранить: " + e.message),
  });

  const commitTitle = () => {
    setEditingTitle(false);
    const v = titleVal.trim();
    if (!v || v === protocol.name) {
      setTitleVal(protocol.name);
      return;
    }
    update.mutate({ name: v });
  };

  // ---- logo upload ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Только изображения");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Максимум 2 МБ");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${protocol.user_id}/${protocol.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("protocol-logos").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("protocol-logos").getPublicUrl(path);
      await update.mutateAsync({ logo_url: publicUrl });
      toast.success("Лого обновлено");
    } catch (e) {
      toast.error("Ошибка загрузки: " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // ---- Client (partner) logo upload ----
  const clientFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingClientLogo, setUploadingClientLogo] = useState(false);

  const handleClientLogoUpload = async (file: File, clientId: string) => {
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return; }
    setUploadingClientLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${protocol.user_id}/client-${clientId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("protocol-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("protocol-logos").getPublicUrl(path);
      const { error } = await supabase
        .from("clients")
        .update({ logo_url: publicUrl } as any)
        .eq("id", clientId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Лого партнёра обновлено");
    } catch (e) {
      toast.error("Ошибка загрузки: " + (e as Error).message);
    } finally {
      setUploadingClientLogo(false);
    }
  };

  const removeClientLogo = async (clientId: string) => {
    const { error } = await supabase.from("clients").update({ logo_url: null } as any).eq("id", clientId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["clients"] });
  };

  // ---- Our side logo upload (stored in protocol_meta.our_logo_url, per-protocol) ----
  const ourLogoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOurLogo, setUploadingOurLogo] = useState(false);
  const ourLogoUrl = meta.our_logo_url ?? null;

  const handleOurLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return; }
    setUploadingOurLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${protocol.user_id}/${protocol.id}-our-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("protocol-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("protocol-logos").getPublicUrl(path);
      await update.mutateAsync({ protocol_meta: { ...meta, our_logo_url: publicUrl } });
      toast.success("Логотип нашей стороны обновлён");
    } catch (e) {
      toast.error("Ошибка загрузки: " + (e as Error).message);
    } finally {
      setUploadingOurLogo(false);
    }
  };

  const removeOurLogo = () =>
    update.mutate({ protocol_meta: { ...meta, our_logo_url: null } });

  // ---- external attendees (people from partner side, e.g. Лента) ----

  // ---- external attendees (people from partner side, e.g. Лента) ----
  const externals = meta.external_attendees ?? [];

  const updateExternals = (next: ExternalAttendee[]) =>
    update.mutate({ protocol_meta: { ...meta, external_attendees: next } });

  const [newExternalName, setNewExternalName] = useState("");
  const addExternal = async () => {
    const name = newExternalName.trim();
    if (!name) return;
    if (externals.some(e => e.name.trim().toLowerCase() === name.toLowerCase())) {
      toast.info("Такой участник уже добавлен");
      return;
    }
    updateExternals([...externals, { name }]);
    setNewExternalName("");

    // Сохраняем в карточку CRM-клиента: если у привязанного клиента ещё нет contact_name,
    // записываем туда имя нового участника (чтобы оно сохранилось «на будущее»).
    const client = meta.client_id ? clients.find(c => c.id === meta.client_id) : null;
    if (client && !client.contact_name?.trim()) {
      const { error } = await supabase
        .from("clients")
        .update({ contact_name: name })
        .eq("id", client.id);
      if (!error) {
        qc.invalidateQueries({ queryKey: ["clients"] });
      }
    }
  };
  const removeExternal = (idx: number) => {
    updateExternals(externals.filter((_, i) => i !== idx));
  };

  // ---- internal attendees (our side) ----
  // Combined list = (auto from task assignees, minus excluded) ∪ manually added
  const internalManual = meta.internal_attendees ?? [];
  const internalExcluded = meta.internal_excluded ?? [];
  const internalCombinedIds = useMemo(() => {
    const fromTasks = (internalAttendeeIds ?? []).filter(uid => !internalExcluded.includes(uid));
    return Array.from(new Set([...fromTasks, ...internalManual]));
  }, [internalAttendeeIds, internalExcluded, internalManual]);

  const [internalPickerOpen, setInternalPickerOpen] = useState(false);

  const addInternalAttendee = (userId: string) => {
    if (internalExcluded.includes(userId)) {
      update.mutate({
        protocol_meta: {
          ...meta,
          internal_excluded: internalExcluded.filter(id => id !== userId),
        },
      });
    } else if (!internalManual.includes(userId) && !(internalAttendeeIds ?? []).includes(userId)) {
      update.mutate({
        protocol_meta: { ...meta, internal_attendees: [...internalManual, userId] },
      });
    }
  };

  const removeInternalAttendee = (userId: string) => {
    const isAuto = (internalAttendeeIds ?? []).includes(userId);
    const isManual = internalManual.includes(userId);
    const next: ProtocolMeta = { ...meta };
    if (isManual) {
      next.internal_attendees = internalManual.filter(id => id !== userId);
    }
    if (isAuto && !internalExcluded.includes(userId)) {
      next.internal_excluded = [...internalExcluded, userId];
    }
    update.mutate({ protocol_meta: next });
  };

  // ---- meeting date / format ----
  const [dateOpen, setDateOpen] = useState(false);
  const [dateVal, setDateVal] = useState(meta.meeting_date ?? "");
  useEffect(() => setDateVal(meta.meeting_date ?? ""), [meta.meeting_date]);

  const setFormat = (f: Format) => update.mutate({ protocol_meta: { ...meta, format: f } });
  const commitDate = () => {
    setDateOpen(false);
    if (dateVal !== (meta.meeting_date ?? "")) update.mutate({ protocol_meta: { ...meta, meeting_date: dateVal || undefined } });
  };

  // ---- CRM clients ----
  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "protocol-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, email, phone, logo_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CrmClient[];
    },
    staleTime: 60_000,
  });

  const linkedClient = useMemo(
    () => (meta.client_id ? clients.find(c => c.id === meta.client_id) ?? null : null),
    [meta.client_id, clients],
  );

  // Parse sides from protocol title: "Лента x Дороничи" → partner=Лента, ours=Дороничи
  const sides = useMemo(() => parseProtocolSides(protocol.name), [protocol.name]);

  // ---- our side name (override of parsed/default "Дороничи") ----
  const ourSideName = meta.our_side_name?.trim() || sides?.ours || "Дороничи";
  const [editingOurName, setEditingOurName] = useState(false);
  const [ourNameVal, setOurNameVal] = useState(ourSideName);
  useEffect(() => setOurNameVal(ourSideName), [ourSideName]);
  const commitOurName = () => {
    setEditingOurName(false);
    const v = ourNameVal.trim();
    const fallback = sides?.ours || "Дороничи";
    const next = !v || v === fallback ? null : v;
    if ((meta.our_side_name ?? null) !== next) {
      update.mutate({ protocol_meta: { ...meta, our_side_name: next } });
    } else {
      setOurNameVal(ourSideName);
    }
  };

  // Auto-match by parsed partner OR by external attendee organization
  useEffect(() => {
    if (meta.client_id || clients.length === 0) return;
    // Priority 1: parsed partner from title
    if (sides?.partner) {
      const m = clients.find(c => namesEqual(c.name, sides.partner));
      if (m) {
        update.mutate({ protocol_meta: { ...meta, client_id: m.id } });
        return;
      }
    }
    // Priority 2: external attendees' organizations
    if (externals.length > 0) {
      const orgs = new Set(
        externals
          .map(e => e.organization?.trim().toLowerCase())
          .filter((s): s is string => !!s),
      );
      if (orgs.size > 0) {
        const m = clients.find(c => orgs.has(c.name.trim().toLowerCase()));
        if (m) update.mutate({ protocol_meta: { ...meta, client_id: m.id } });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sides?.partner, externals.map(e => e.organization).join("|"), clients.length, meta.client_id]);

  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");

  // Дедуп клиентов в UI на случай старых дублей или клиентов с одинаковым именем у разных юзеров
  const dedupedClients = useMemo(() => {
    const seen = new Map<string, CrmClient>();
    for (const c of clients) {
      const key = c.name.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, c);
    }
    return [...seen.values()];
  }, [clients]);

  const filteredClients = dedupedClients.filter(c =>
    !clientSearch.trim() ||
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.contact_name?.toLowerCase().includes(clientSearch.toLowerCase()),
  );

  const searchMatchesExisting = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return false;
    return dedupedClients.some(c => c.name.trim().toLowerCase() === q);
  }, [clientSearch, dedupedClients]);

  const linkClient = (id: string | null) => {
    update.mutate({ protocol_meta: { ...meta, client_id: id } });
    setClientPickerOpen(false);
    setClientSearch("");
  };

  // ---- Create CRM client dialog (when partner from title is not found OR from picker "+ Создать") ----
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [autoLinkAfterCreate, setAutoLinkAfterCreate] = useState(true);

  const partnerNotInCrm = !!sides?.partner
    && clients.length > 0
    && !meta.client_id
    && !clients.some(c => namesEqual(c.name, sides.partner));

  const openCreateDialog = (initialName: string, autoLink: boolean) => {
    setNewClientName(initialName);
    setAutoLinkAfterCreate(autoLink);
    setCreateDialogOpen(true);
  };

  const createClient = async () => {
    const name = newClientName.trim();
    if (!name || !user) return;
    setCreating(true);
    try {
      // Проверка дублей до вставки (UI-friendly ошибка вместо unique-violation)
      const existing = clients.find(c => namesEqual(c.name, name));
      if (existing) {
        if (autoLinkAfterCreate) {
          await supabase
            .from("task_groups")
            .update({ protocol_meta: { ...meta, client_id: existing.id } as any })
            .eq("id", protocol.id);
          qc.invalidateQueries({ queryKey: ["task_groups"] });
          toast.success(`Клиент «${name}» уже есть — привязан`);
        } else {
          toast.info(`Клиент «${name}» уже есть в CRM`);
        }
        setCreateDialogOpen(false);
        setClientPickerOpen(false);
        setClientSearch("");
        return;
      }

      const { data, error } = await supabase
        .from("clients")
        .insert({ name, user_id: user.id })
        .select("id")
        .single();
      if (error) throw error;

      if (autoLinkAfterCreate) {
        await supabase
          .from("task_groups")
          .update({ protocol_meta: { ...meta, client_id: data.id } as any })
          .eq("id", protocol.id);
        qc.invalidateQueries({ queryKey: ["task_groups"] });
        toast.success(`Клиент «${name}» создан и привязан`);
      } else {
        toast.success(`Клиент «${name}» добавлен в CRM`);
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      setCreateDialogOpen(false);
      setClientPickerOpen(false);
      setClientSearch("");
    } catch (e) {
      toast.error("Не удалось создать клиента: " + (e as Error).message);
    } finally {
      setCreating(false);
    }
  };


  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-5">
      {/* Top row */}
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Logo / icon */}
        <div className="relative shrink-0">
          {protocol.logo_url ? (
            <img
              src={protocol.logo_url}
              alt="Логотип"
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-border sm:h-14 sm:w-14"
            />
          ) : (
            <div
              className="flex h-12 w-12 items-center justify-center rounded-lg text-2xl sm:h-14 sm:w-14 sm:text-3xl"
              style={{
                backgroundColor: `${protocol.color ?? "#6366f1"}20`,
                color: protocol.color ?? "#6366f1",
              }}
            >
              {protocol.icon ?? "📋"}
            </div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Загрузить логотип"
          >
            <ImageIcon className="h-3 w-3" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLogoUpload(file);
              e.target.value = "";
            }}
          />
          {protocol.logo_url && (
            <button
              type="button"
              onClick={() => update.mutate({ logo_url: null })}
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
              title="Удалить логотип"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {editingTitle ? (
              <input
                autoFocus
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { setTitleVal(protocol.name); setEditingTitle(false); }
                }}
                className="w-full flex-1 rounded border border-input bg-background px-2 py-1 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring sm:text-2xl"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="group flex min-w-0 max-w-full items-center gap-2 text-left"
              >
                <h1 className="min-w-0 break-words text-lg font-semibold leading-tight text-foreground sm:truncate sm:text-2xl">{protocol.name}</h1>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            {isDraft && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Черновик
              </span>
            )}
          </div>

          {/* Meta row: date + format + CRM link */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {meta.meeting_date
                    ? format(parseISO(meta.meeting_date), "d MMMM yyyy", { locale: ru })
                    : "Дата встречи"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <Input
                  type="date"
                  value={dateVal}
                  onChange={(e) => setDateVal(e.target.value)}
                  onBlur={commitDate}
                  className="h-8 text-xs"
                />
              </PopoverContent>
            </Popover>

            {!isCrossFunctional && (
            <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
              {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => {
                const Icon = FORMAT_LABEL[f].icon;
                const active = fmt === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {FORMAT_LABEL[f].label}
                  </button>
                );
              })}
            </div>
            )}

            {/* CRM client link */}
            {!isCrossFunctional && (
            <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
                    linkedClient
                      ? "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                      : "border-dashed border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                  title={linkedClient ? `CRM-клиент: ${linkedClient.name}` : "Привязать к CRM-клиенту"}
                >
                  {linkedClient ? <Link2 className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                  <span className="max-w-[160px] truncate">
                    {linkedClient ? linkedClient.name : "Привязать клиента CRM"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <Input
                  autoFocus
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Поиск по клиентам CRM…"
                  className="mb-2 h-7 text-xs"
                />
                <div className="max-h-64 overflow-y-auto">
                  {linkedClient && (
                    <button
                      onClick={() => linkClient(null)}
                      className="mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                    >
                      <Unlink className="h-3 w-3" /> Отвязать клиента
                    </button>
                  )}
                  {filteredClients.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      {clients.length === 0
                        ? "В CRM пока нет клиентов."
                        : "Не найдено"}
                    </div>
                  ) : (
                    filteredClients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => linkClient(c.id)}
                        className={cn(
                          "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
                          c.id === meta.client_id && "bg-purple-500/10 text-purple-700 dark:text-purple-300",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 shrink-0 opacity-60" />
                          <span className="truncate font-medium">{c.name}</span>
                        </div>
                        {c.contact_name && (
                          <div className="ml-4 truncate text-[10px] text-muted-foreground">
                            {c.contact_name}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
                {/* + Создать клиента (по строке поиска или с пустым именем) */}
                {clientSearch.trim() && !searchMatchesExisting ? (
                  <button
                    type="button"
                    onClick={() => openCreateDialog(clientSearch.trim(), true)}
                    className="mt-2 flex w-full items-center gap-1.5 rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" />
                    Создать клиента «{clientSearch.trim()}»
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => openCreateDialog("", false)}
                    className="mt-2 flex w-full items-center gap-1.5 rounded border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Добавить клиента в CRM
                  </button>
                )}
                <div className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                  💡 Шаги воронки появятся автоматически при перетаскивании карточки по этапам в CRM.
                </div>
              </PopoverContent>
            </Popover>
            )}

            {/* Parsed sides chip — show only when partner is missing in CRM (action needed) */}
            {!isCrossFunctional && sides && partnerNotInCrm && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400"
                title="Стороны определены из названия встречи"
              >
                <Sparkles className="h-3 w-3 opacity-70" />
                <span className="font-medium text-foreground">{sides.partner}</span>
                <span className="opacity-60">×</span>
                <span>{sides.ours}</span>
                <button
                  type="button"
                  onClick={() => openCreateDialog(sides?.partner ?? "", true)}
                  className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 hover:bg-amber-500/30 dark:text-amber-300"
                >
                  + В CRM
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Create CRM client dialog */}
      <AlertDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {autoLinkAfterCreate ? "Создать клиента CRM" : "Новый клиент в CRM"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {autoLinkAfterCreate
                ? <>Партнёр <span className="font-medium text-foreground">«{newClientName || sides?.partner}»</span> не найден в CRM. Создать карточку и привязать к этому протоколу?</>
                : <>Карточка появится в базе CRM. Шаги воронки <span className="font-medium text-foreground">не</span> создаются — они добавятся автоматически при перетаскивании по этапам.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Название клиента
            </label>
            <Input
              autoFocus
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newClientName.trim()) {
                  e.preventDefault();
                  createClient();
                }
              }}
              placeholder="Например: Лента"
              className="h-9"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); createClient(); }}
              disabled={creating || !newClientName.trim()}
            >
              {creating
                ? "Создаю…"
                : autoLinkAfterCreate ? "Создать и привязать" : "Создать"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Sides of the meeting (auto from title + CRM) */}
      {!isCrossFunctional && (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {/* Our side (Дороничи) — name + own logo upload (independent from header logo) */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="relative shrink-0">
            <img
              src={ourLogoUrl ?? ourLogoDefault}
              alt={sides?.ours ?? "Наша сторона"}
              className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
            />
            <button
              type="button"
              onClick={() => ourLogoInputRef.current?.click()}
              disabled={uploadingOurLogo}
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground disabled:opacity-50"
              title="Загрузить логотип нашей стороны"
            >
              <ImageIcon className="h-2.5 w-2.5" />
            </button>
            <input
              ref={ourLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleOurLogoUpload(file);
                e.target.value = "";
              }}
            />
            {ourLogoUrl && (
              <button
                type="button"
                onClick={removeOurLogo}
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                title="Сбросить к дефолтному"
              >
                <X className="h-2 w-2" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            {editingOurName ? (
              <input
                autoFocus
                value={ourNameVal}
                onChange={(e) => setOurNameVal(e.target.value)}
                onBlur={commitOurName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitOurName(); }
                  if (e.key === "Escape") { setOurNameVal(ourSideName); setEditingOurName(false); }
                }}
                className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingOurName(true)}
                className="group flex w-full items-center gap-1 text-left"
                title="Изменить название нашей стороны"
              >
                <span className="truncate text-sm font-semibold text-foreground">{ourSideName}</span>
                <Pencil className="h-2.5 w-2.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}

            {/* Internal attendees (our side) — auto from task assignees + manual */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {internalCombinedIds.map((uid) => {
                const p = profiles.find((u) => u.id === uid);
                const name = p?.display_name || p?.email || "Участник";
                return (
                  <span
                    key={uid}
                    className="group inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
                    title={name}
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeInternalAttendee(uid)}
                      className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      title="Убрать из участников встречи"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                );
              })}
              <MultiAssigneePicker
                users={profiles}
                excludeIds={internalCombinedIds}
                open={internalPickerOpen}
                onOpenChange={setInternalPickerOpen}
                onSelectUsers={(ids) => ids.forEach((uid) => addInternalAttendee(uid))}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    title="Добавить участника со стороны Дороничей"
                  >
                    <Plus className="h-2.5 w-2.5" /> участник
                  </button>
                }
              />
            </div>
          </div>
        </div>

        {/* Partner side (CRM client + custom attendees) */}
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="relative shrink-0">
            {linkedClient?.logo_url ? (
              <img
                src={linkedClient.logo_url}
                alt={linkedClient.name}
                className="h-12 w-12 rounded-lg object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10 text-sm font-bold text-purple-600 dark:text-purple-300">
                {linkedClient
                  ? getInitials(linkedClient.name)
                  : sides?.partner
                    ? getInitials(sides.partner)
                    : <Building2 className="h-5 w-5 opacity-50" />}
              </div>
            )}
            {linkedClient && (
              <>
                <button
                  type="button"
                  onClick={() => clientFileInputRef.current?.click()}
                  disabled={uploadingClientLogo}
                  className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground disabled:opacity-50"
                  title="Загрузить логотип партнёра"
                >
                  <ImageIcon className="h-2.5 w-2.5" />
                </button>
                <input
                  ref={clientFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && linkedClient) handleClientLogoUpload(file, linkedClient.id);
                    e.target.value = "";
                  }}
                />
                {linkedClient.logo_url && (
                  <button
                    type="button"
                    onClick={() => removeClientLogo(linkedClient.id)}
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-destructive"
                    title="Удалить логотип"
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {linkedClient?.name
                  ?? sides?.partner
                  ?? <span className="text-muted-foreground/70">Партнёр</span>}
              </span>
            </div>
            {!linkedClient && (
              <div className="mt-0.5">
                <button
                  type="button"
                  onClick={() => sides?.partner ? openCreateDialog(sides.partner, true) : setClientPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded text-[10px] font-semibold text-primary hover:underline"
                >
                  <Plus className="h-2.5 w-2.5" />
                  {sides?.partner ? `Добавить «${sides.partner}» в CRM` : "Привязать клиента"}
                </button>
              </div>
            )}
            {/* Custom attendees from partner side — same chip style as our side */}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {externals.map((p, idx) => (
                <span
                  key={`${p.name}-${idx}`}
                  className="group inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground/80"
                  title={p.role || undefined}
                >
                  {p.name}
                  <button
                    type="button"
                    onClick={() => removeExternal(idx)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    title="Удалить"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    title="Добавить участника со стороны партнёра"
                  >
                    <Plus className="h-2.5 w-2.5" /> участник
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <Input
                    autoFocus
                    value={newExternalName}
                    onChange={(e) => setNewExternalName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addExternal(); }
                    }}
                    placeholder="Имя или должность"
                    className="h-8 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addExternal}
                    disabled={!newExternalName.trim()}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" /> Добавить
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Cross-functional: compact internal attendees row */}
      {isCrossFunctional && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">Участники:</span>
          {internalCombinedIds.length === 0 && (
            <span className="text-[11px] text-muted-foreground/70">пока никого</span>
          )}
          {internalCombinedIds.map((uid) => {
            const p = profiles.find((u) => u.id === uid);
            const name = p?.display_name || p?.email || "Участник";
            return (
              <span
                key={uid}
                className="group inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground/80"
                title={name}
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeInternalAttendee(uid)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  title="Убрать из участников встречи"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
          <MultiAssigneePicker
            users={profiles}
            excludeIds={internalCombinedIds}
            open={internalPickerOpen}
            onOpenChange={setInternalPickerOpen}
            onSelectUsers={(ids) => ids.forEach((uid) => addInternalAttendee(uid))}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                title="Добавить участника встречи"
              >
                <Plus className="h-2.5 w-2.5" /> участник
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}
