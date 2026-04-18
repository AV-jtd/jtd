import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAvailableUsers } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Calendar as CalendarIcon,
  Image as ImageIcon,
  Pencil,
  Plus,
  Users,
  Wifi,
  WifiOff,
  X,
  Check,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getInitials } from "@/lib/initials";

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
  internalAttendeeIds?: string[]; // group_members IDs (for now: collected from tasks.assigned_to)
}

const FORMAT_LABEL: Record<Format, { label: string; icon: typeof Wifi }> = {
  online: { label: "Онлайн", icon: Wifi },
  offline: { label: "Офлайн", icon: Users },
  hybrid: { label: "Гибрид", icon: WifiOff },
};

export default function ProtocolHeader({ protocol, isDraft, internalAttendeeIds = [] }: Props) {
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

  // ---- internal attendees: derived from group_members or assignees ----
  const internalAttendees = profiles.filter(p => internalAttendeeIds.includes(p.id));

  // ---- external attendees mgmt ----
  const externals = meta.external_attendees ?? [];
  const [addingExternal, setAddingExternal] = useState(false);
  const [newExt, setNewExt] = useState<ExternalAttendee>({ name: "", organization: "", role: "" });

  const addExternal = () => {
    const name = newExt.name.trim();
    if (!name) return;
    const next = [...externals, { name, organization: newExt.organization?.trim() || undefined, role: newExt.role?.trim() || undefined }];
    update.mutate({ protocol_meta: { ...meta, external_attendees: next } });
    setNewExt({ name: "", organization: "", role: "" });
    setAddingExternal(false);
  };

  const removeExternal = (idx: number) => {
    const next = externals.filter((_, i) => i !== idx);
    update.mutate({ protocol_meta: { ...meta, external_attendees: next } });
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

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* Top row: logo + title + draft badge */}
      <div className="flex items-start gap-4">
        {/* Logo / icon */}
        <div className="relative shrink-0">
          {protocol.logo_url ? (
            <img
              src={protocol.logo_url}
              alt="Логотип"
              className="h-14 w-14 rounded-lg object-cover ring-1 ring-border"
            />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-lg text-3xl"
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
          {/* Editable title */}
          <div className="flex items-center gap-2">
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
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-2xl font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="group flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <h1 className="truncate text-2xl font-semibold text-foreground">{protocol.name}</h1>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            {isDraft && (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Черновик
              </span>
            )}
          </div>

          {/* Meta row: date + format */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
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

            <span className="text-muted-foreground/60">
              <FmtIcon className="mr-1 inline h-3 w-3" />
              {FORMAT_LABEL[fmt].label}
            </span>
          </div>
        </div>
      </div>

      {/* Attendees */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Internal */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Внутренние участники ({internalAttendees.length})
          </div>
          {internalAttendees.length === 0 ? (
            <p className="text-xs text-muted-foreground/70">
              Появятся, когда назначите ответственных в задачах ниже.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {internalAttendees.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background px-2 py-0.5 text-xs text-foreground"
                  title={p.email ?? undefined}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                    {initials(p.display_name || p.email || "?")}
                  </span>
                  <span className="max-w-[140px] truncate">
                    {p.display_name || p.email || p.id.slice(0, 6)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* External */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Внешние участники ({externals.length})
            </div>
            {!addingExternal && (
              <button
                type="button"
                onClick={() => setAddingExternal(true)}
                className="inline-flex items-center gap-1 rounded text-[11px] text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Добавить
              </button>
            )}
          </div>

          {externals.length === 0 && !addingExternal ? (
            <p className="text-xs text-muted-foreground/70">
              Партнёры, контрагенты, гости. Будут доступны для назначения ответственными.
            </p>
          ) : (
            <div className="space-y-1.5">
              {externals.map((ext, i) => (
                <div
                  key={i}
                  className="group flex items-center justify-between rounded bg-background px-2 py-1 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{ext.name}</span>
                    {ext.organization && (
                      <span className="ml-1.5 text-muted-foreground">· {ext.organization}</span>
                    )}
                    {ext.role && (
                      <span className="ml-1.5 text-muted-foreground/70">({ext.role})</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExternal(i)}
                    className="ml-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingExternal && (
            <div className="mt-2 space-y-1.5 rounded border border-dashed border-border p-2">
              <Input
                autoFocus
                value={newExt.name}
                onChange={(e) => setNewExt((s) => ({ ...s, name: e.target.value }))}
                placeholder="ФИО"
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addExternal(); }
                  if (e.key === "Escape") { setAddingExternal(false); setNewExt({ name: "", organization: "", role: "" }); }
                }}
              />
              <Input
                value={newExt.organization ?? ""}
                onChange={(e) => setNewExt((s) => ({ ...s, organization: e.target.value }))}
                placeholder="Организация (необязательно)"
                className="h-7 text-xs"
              />
              <Input
                value={newExt.role ?? ""}
                onChange={(e) => setNewExt((s) => ({ ...s, role: e.target.value }))}
                placeholder="Должность / роль (необязательно)"
                className="h-7 text-xs"
              />
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={addExternal} disabled={!newExt.name.trim()}>
                  <Check className="h-3 w-3" /> Добавить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setAddingExternal(false); setNewExt({ name: "", organization: "", role: "" }); }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
