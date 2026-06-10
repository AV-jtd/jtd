import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Copy, Send, FileText, Mail, Loader2, Check, Calendar as CalendarIcon, Wifi, Users as UsersIcon, WifiOff, Sparkles, Link2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { useTaskGroups, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { useEventTopicTags } from "@/hooks/useEventTopicTags";
import { useDecisions } from "@/hooks/useDecisions";
import { parseProtocolSides } from "@/lib/protocolSides";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ourLogoDefault from "@/assets/our-logo-default.jpg";
import { getInitials } from "@/lib/initials";

const FORMAT_META: Record<string, { label: string; Icon: typeof Wifi }> = {
  online: { label: "Онлайн", Icon: Wifi },
  offline: { label: "Офлайн", Icon: UsersIcon },
  hybrid: { label: "Гибрид", Icon: WifiOff },
};

interface Props {
  protocolId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  online: "Онлайн",
  offline: "Офлайн",
  hybrid: "Гибрид",
};

// A4 в пикселях @ 96dpi
const A4_W = 794;
const A4_PADDING = 48; // ~12.7mm — компактно, максимум места для контента

export default function ProtocolPreviewDialog({ protocolId, open, onOpenChange }: Props) {
  const { data: groups = [] } = useTaskGroups();
  // Pass protocolId so draft tasks are visible in preview before publish.
  const { data: allTasks = [] } = useTasks(protocolId);
  const { data: users = [] } = useAvailableUsers();

  const { topicTags } = useEventTopicTags();
  const getTaskTopic = (t: any) => {
    const ids = (t.task_tags ?? []).map((tt: any) => tt.tag_id);
    return topicTags.find((tag) => ids.includes(tag.id)) ?? null;
  };

  const protocol = useMemo(() => groups.find((g) => g.id === protocolId), [groups, protocolId]);
  const meta: any = (protocol as any)?.protocol_meta ?? {};
  const sides = useMemo(() => parseProtocolSides(protocol?.name), [protocol?.name]);
  const isCrossFunctional = meta?.template_system_key === "cross_functional";
  const isLiving = meta?.template_system_key === "living";
  // For internal-style protocols (cross-functional, living) we treat layout the same:
  // single side, no partner card, no signatures.
  const isInternalStyle = isCrossFunctional || isLiving;
  const topicNotes: Record<string, string> = (meta?.topic_notes as Record<string, string>) ?? {};

  // CRM client (для логотипа и имени партнёра)
  const linkedClientId: string | null = isCrossFunctional ? null : (meta.client_id ?? null);
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  useEffect(() => {
    if (!linkedClientId) {
      setClientLogoUrl(null);
      setClientName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("clients")
      .select("name, logo_url")
      .eq("id", linkedClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setClientLogoUrl((data as any)?.logo_url ?? null);
          setClientName((data as any)?.name ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [linkedClientId]);

  // Partner: сначала из названия, потом из CRM, потом из organization внешних участников
  const externals: Array<{ name: string; organization?: string; role?: string }> =
    meta.external_attendees ?? [];
  const partnerName =
    isCrossFunctional ? null :
    sides?.partner ||
    clientName ||
    externals.find((e) => e.organization?.trim())?.organization?.trim() ||
    null;

  const ourSideName =
    meta.our_side_name?.trim() || sides?.ours || "Наша сторона";

  const tasks = useMemo(
    () =>
      allTasks
        .filter((t) => t.group_id === protocolId && (t as any).protocol_scope !== "internal")
        .sort((a, b) => a.position - b.position),
    [allTasks, protocolId],
  );

  // Зафиксированные «решения встречи» (отдельная сущность). В экспортируемый
  // документ/письмо попадают только решения уровня протокола (не «ограниченные»).
  const { data: allDecisions = [] } = useDecisions({ protocolId });
  const decisions = useMemo(
    () =>
      allDecisions.filter(
        (d) => d.visibility === "protocol" && d.status === "active",
      ),
    [allDecisions],
  );

  const internalAttendeeIds = useMemo(() => {
    const fromTasks = Array.from(
      new Set(
        tasks.filter((t) => t.assigned_to).map((t) => t.assigned_to as string),
      ),
    );
    const excluded: string[] = meta.internal_excluded ?? [];
    const manual: string[] = meta.internal_attendees ?? [];
    return Array.from(new Set([...fromTasks.filter((id) => !excluded.includes(id)), ...manual]));
  }, [tasks, meta]);

  const userName = (id: string | null | undefined) => {
    if (!id) return null;
    const u: any = users.find((x: any) => x.id === id);
    return u?.display_name || u?.email || null;
  };

  // ---------- Sides toggle: показывать имена или только сторону ----------
  const [showSideOnly, setShowSideOnly] = useState(false);
  const [groupByTopic, setGroupByTopic] = useState(() => {
    // Living protocols are organized by topic by default.
    if (meta?.template_system_key === "living") return true;
    const topicIds = new Set<string>();
    for (const t of tasks) {
      const topic = getTaskTopic(t);
      if (topic) topicIds.add(topic.id);
      if (topicIds.size >= 2) return true;
    }
    return false;
  });

  // Подгружаем organization для всех пользователей, упомянутых в задачах
  const [orgMap, setOrgMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const ids = Array.from(new Set(tasks.map((t) => t.assigned_to).filter(Boolean) as string[]));
    if (ids.length === 0) {
      setOrgMap({});
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, organization")
      .in("id", ids)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, string | null> = {};
        (data ?? []).forEach((p: any) => {
          map[p.id] = (p.organization?.trim() || null);
        });
        setOrgMap(map);
      });
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  // Какую сторону показать вместо имени:
  // 1) явная organization из профиля
  // 2) иначе — наша сторона (внутренний пользователь по умолчанию)
  const sideForUser = (id: string | null | undefined): string => {
    if (!id) return ourSideName;
    return orgMap[id] || ourSideName;
  };

  // Метка ответственного с учётом тумблера
  const respLabel = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (showSideOnly) return sideForUser(id);
    return userName(id);
  };

  const meetingDateLabel = meta.meeting_date
    ? format(parseISO(meta.meeting_date), "d MMMM yyyy", { locale: ru })
    : "—";

  const formatLabel = FORMAT_LABEL[meta.format ?? "offline"] ?? "Офлайн";

  // ---------- Build Email text ----------
  const emailText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Тема: Протокол встречи — ${protocol?.name ?? ""}`);
    lines.push("");
    lines.push(`Дата: ${meetingDateLabel}`);
    lines.push(`Формат: ${formatLabel}`);
    lines.push("");
    lines.push(isCrossFunctional ? "Участники:" : `Участники со стороны ${ourSideName}:`);
    if (internalAttendeeIds.length === 0) lines.push("  — не указаны");
    else internalAttendeeIds.forEach((id) => lines.push(`  • ${userName(id) ?? "—"}`));
    lines.push("");
    if (partnerName && !isCrossFunctional) {
      lines.push(`Участники со стороны ${partnerName}:`);
      if (externals.length === 0) lines.push("  — не указаны");
      else
        externals.forEach((e) =>
          lines.push(
            `  • ${e.name}${e.role ? `, ${e.role}` : ""}${e.organization ? ` (${e.organization})` : ""}`,
          ),
        );
      lines.push("");
    }
    if (decisions.length > 0) {
      lines.push("Принятые решения:");
      decisions.forEach((d, i) => {
        const dl = format(parseISO(d.decided_at), "d MMM yyyy", { locale: ru });
        lines.push(`  ${i + 1}. ${d.title} (${dl})`);
        const body = (d.body ?? "").trim();
        if (body) {
          body.split("\n").forEach((ln) => lines.push(`      ${ln}`));
        }
      });
      lines.push("");
    }
    lines.push("Решения и задачи:");
    if (tasks.length === 0) {
      lines.push("  — нет задач");
    } else {
      tasks.forEach((t, i) => {
        const dl = t.deadline
          ? format(parseISO(t.deadline), "d MMM yyyy", { locale: ru })
          : "без срока";
        const resp = respLabel(t.assigned_to) ?? "не назначен";
        const topic = getTaskTopic(t);
        lines.push(`  ${i + 1}. ${t.title}`);
        if (topic) lines.push(`      Тема: ${topic.name}`);
        const desc = (t.description ?? "").trim();
        if (desc) {
          desc.split("\n").forEach((ln) => lines.push(`      ${ln}`));
        }
        lines.push(`      Ответственный: ${resp} · Срок: ${dl}`);
      });
    }
    return lines.join("\n");
  }, [protocol?.name, meetingDateLabel, formatLabel, ourSideName, internalAttendeeIds, partnerName, externals, tasks, users, showSideOnly, orgMap, topicTags, decisions]);

  // ---------- Actions ----------
  const a4Ref = useRef<HTMLDivElement>(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyTg, setBusyTg] = useState(false);
  const [tab, setTab] = useState<"document" | "email">("document");

  // Section-by-section PDF: каждая секция помечена data-pdf-section, чтобы не разрезать таблицу.
  const handleDownloadPdf = async () => {
    if (!a4Ref.current) return;
    setBusyPdf(true);
    try {
      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      const MARGIN_MM = 12;
      const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;

      const sections = Array.from(
        a4Ref.current.querySelectorAll<HTMLElement>("[data-pdf-section]"),
      );

      // Hide elements marked as preview-only during PDF rendering
      const hidden = Array.from(
        a4Ref.current.querySelectorAll<HTMLElement>("[data-hide-in-pdf]"),
      );
      const prevDisplay = hidden.map((el) => el.style.display);
      hidden.forEach((el) => { el.style.display = "none"; });

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      let currentY = MARGIN_MM;
      const SECTION_GAP_MM = 3;

      try {
        for (const section of sections) {
          const canvas = await html2canvas(section, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
          });
          const widthPx = canvas.width / 2;
          const heightPx = canvas.height / 2;
          const scaleFactor = CONTENT_WIDTH_MM / widthPx;
          const heightMM = heightPx * scaleFactor;

          const remaining = A4_HEIGHT_MM - MARGIN_MM - currentY;
          if (heightMM > remaining && currentY > MARGIN_MM) {
            pdf.addPage();
            currentY = MARGIN_MM;
          }

          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          pdf.addImage(imgData, "JPEG", MARGIN_MM, currentY, CONTENT_WIDTH_MM, heightMM);
          currentY += heightMM + SECTION_GAP_MM;
        }
      } finally {
        // Restore preview-only elements
        hidden.forEach((el, i) => { el.style.display = prevDisplay[i]; });
      }

      const fname = `Протокол - ${protocol?.name ?? "встреча"}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(fname);
      toast.success("PDF скачан");
    } catch (e) {
      toast.error("Не удалось создать PDF: " + (e as Error).message);
    } finally {
      setBusyPdf(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Скопировано в буфер");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const handleSendTelegram = async () => {
    if (internalAttendeeIds.length === 0) {
      toast.info("Нет участников нашей стороны");
      return;
    }
    setBusyTg(true);
    try {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const htmlText = esc(emailText);

      const { data, error } = await supabase.functions.invoke("send-protocol-telegram", {
        body: {
          text: htmlText,
          recipient_user_ids: internalAttendeeIds,
        },
      });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent === 0) {
        toast.info("Никто из участников не привязал Telegram");
      } else {
        toast.success(`Отправлено ${sent} участникам в Telegram`);
      }
    } catch (e) {
      toast.error("Ошибка отправки: " + (e as Error).message);
    } finally {
      setBusyTg(false);
    }
  };

  if (!protocol) return null;

  // Логотип нашей стороны = тот же, что в шапке приложения (meta.our_logo_url),
  // protocol.logo_url — это иконка/обложка протокола, не подходит для бренда нашей стороны.
  const ourLogo = meta.our_logo_url || ourLogoDefault;
  const contentWidth = A4_W - A4_PADDING * 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold">
            Превью протокола
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-3 pb-2 border-b border-border bg-muted/30">
            <TabsList className="bg-background">
              <TabsTrigger value="document" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Документ A4
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5" />
                Email-резюме
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              {/* Toggle: Имена / Стороны */}
              <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setShowSideOnly(false)}
                  className={`px-2 py-1 rounded transition-colors ${
                    !showSideOnly
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Показывать имена ответственных"
                >
                  Имена
                </button>
                <button
                  type="button"
                  onClick={() => setShowSideOnly(true)}
                  className={`px-2 py-1 rounded transition-colors ${
                    showSideOnly
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Показывать только сторону (Дороничи / Лента)"
                >
                  Стороны
                </button>
              </div>

              {/* Toggle: Группировка по теме (только для документа) */}
              {tab === "document" && (
                <button
                  type="button"
                  onClick={() => setGroupByTopic((v) => !v)}
                  className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
                    groupByTopic
                      ? "border-primary/40 bg-primary/10 text-primary font-medium"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                  title="Сгруппировать задачи по теме"
                >
                  {groupByTopic ? "По теме ✓" : "По теме"}
                </button>
              )}

              {tab === "document" ? (
                <Button size="sm" onClick={handleDownloadPdf} disabled={busyPdf} className="gap-1.5">
                  {busyPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Скачать PDF
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Скопировано" : "Скопировать"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendTelegram}
                disabled={busyTg}
                className="gap-1.5"
              >
                {busyTg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                В Telegram
              </Button>
            </div>
          </div>

          <TabsContent value="document" className="flex-1 overflow-auto m-0 bg-neutral-200/50 p-6">
            <div
              className="mx-auto bg-white shadow-xl"
              style={{ width: A4_W, minHeight: 1123 }}
            >
              <div
                ref={a4Ref}
                className="text-[12px] leading-[1.5] text-neutral-900"
                style={{
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  padding: A4_PADDING,
                  width: A4_W,
                  boxSizing: "border-box",
                }}
              >
                {/* === SECTION 1: Header — mirrors in-app ProtocolHeader (no edit artifacts) === */}
                <div data-pdf-section style={{ width: contentWidth }}>
                  {(() => {
                    const isDraft = (protocol as any)?.draft_status === "draft";
                    const fmtKey = (meta.format ?? "offline") as string;
                    const FmtIcon = FORMAT_META[fmtKey]?.Icon ?? UsersIcon;
                    const fmtTxt = FORMAT_META[fmtKey]?.label ?? "Офлайн";
                    return (
                      <>
                        {/* Top row: protocol icon/logo + title + draft chip */}
                        <div className="flex items-start gap-3">
                          {protocol.logo_url ? (
                            <img
                              src={protocol.logo_url}
                              alt=""
                              className="h-12 w-12 rounded-lg object-contain bg-white ring-1 ring-neutral-200 shrink-0"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-lg text-2xl shrink-0"
                              style={{
                                backgroundColor: `${protocol.color ?? "#6366f1"}20`,
                                color: protocol.color ?? "#6366f1",
                              }}
                            >
                              {protocol.icon ?? "📋"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h1 className="text-[20px] font-semibold leading-tight text-neutral-900 break-words">
                              {protocol.name}
                            </h1>
                            {/* Meta chips row */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-neutral-700">
                                <CalendarIcon className="h-3 w-3 text-neutral-500" />
                                <span className="font-medium">{meetingDateLabel}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-neutral-700">
                                <FmtIcon className="h-3 w-3 text-neutral-500" />
                                <span className="font-medium">{fmtTxt}</span>
                              </span>
                              {linkedClientId && partnerName && !isInternalStyle && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-purple-300 bg-purple-50 px-2 py-0.5 text-purple-700">
                                  <Link2 className="h-3 w-3" />
                                  <span className="font-medium">{partnerName}</span>
                                </span>
                              )}
                              {sides && !isInternalStyle && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-neutral-700">
                                  <Sparkles className="h-3 w-3 text-neutral-500" />
                                  <span className="font-medium text-neutral-900">{sides.partner}</span>
                                  <span className="opacity-50">×</span>
                                  <span>{sides.ours}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          {isDraft && (
                            <span
                              data-hide-in-pdf
                              className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                            >
                              Черновик
                            </span>
                          )}
                        </div>

                        {/* Two side cards: our side + partner side */}
                        <div className={`mt-4 grid gap-3 ${isInternalStyle ? "grid-cols-1" : "grid-cols-2"}`}>
                          {/* Our side */}
                          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                            <img
                              src={ourLogo}
                              alt={ourSideName}
                              className="h-10 w-10 rounded-lg object-contain bg-white ring-1 ring-neutral-200 shrink-0"
                              crossOrigin="anonymous"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-semibold text-neutral-900">
                                {isInternalStyle ? "Участники встречи" : ourSideName}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {internalAttendeeIds.length === 0 ? (
                                  <span className="text-[10px] italic text-neutral-400">не указаны</span>
                                ) : (
                                  internalAttendeeIds.map((id) => (
                                    <span
                                      key={id}
                                      className="inline-flex items-center rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-700"
                                    >
                                      {userName(id) ?? "—"}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Partner side — hidden for cross-functional (internal meeting) */}
                          {!isInternalStyle && (
                          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                            {clientLogoUrl ? (
                              <img
                                src={clientLogoUrl}
                                alt={partnerName ?? ""}
                                className="h-10 w-10 rounded-lg object-contain bg-white ring-1 ring-neutral-200 shrink-0"
                                crossOrigin="anonymous"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-[12px] font-bold text-purple-700 ring-1 ring-purple-200 shrink-0">
                                {partnerName ? getInitials(partnerName) : "?"}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-semibold text-neutral-900">
                                {partnerName ?? <span className="text-neutral-400">Партнёр</span>}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {externals.length === 0 ? (
                                  <span className="text-[10px] italic text-neutral-400">не указаны</span>
                                ) : (
                                  externals.map((p, idx) => {
                                    const extras = [p.role, p.organization].filter(Boolean).join(", ");
                                    return (
                                      <span
                                        key={`${p.name}-${idx}`}
                                        className="inline-flex items-center rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-700"
                                        title={extras || undefined}
                                      >
                                        {p.name}
                                      </span>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* === SECTION 2.5: Public summary (if enabled & public) === */}
                {meta?.summary?.enabled && meta?.summary?.scope === "public" && meta?.summary?.text?.trim() && (
                  <div data-pdf-section className="mt-5" style={{ width: contentWidth }}>
                    <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5 font-medium">
                      Саммари встречи
                    </div>
                    <div className="rounded-md border border-neutral-300 bg-neutral-50 p-3 text-[11px] leading-[1.55] text-neutral-800 whitespace-pre-wrap">
                      {meta.summary.text}
                    </div>
                  </div>
                )}

                {/* === SECTION 3: Decisions table === */}
                {/* === SECTION 2.7: Принятые решения (отдельная сущность) === */}
                {decisions.length > 0 && (
                  <div data-pdf-section className="mt-5" style={{ width: contentWidth }}>
                    <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5 font-medium">
                      Принятые решения · {decisions.length}
                    </div>
                    <ol className="space-y-1.5">
                      {decisions.map((d, i) => {
                        const body = (d.body ?? "").trim();
                        return (
                          <li
                            key={d.id}
                            className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2"
                          >
                            <span className="shrink-0 text-[11px] font-semibold text-amber-700">
                              {i + 1}.
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-medium leading-snug text-neutral-900">
                                {d.title}
                              </div>
                              {body && (
                                <div className="mt-0.5 whitespace-pre-wrap text-[11px] leading-[1.45] text-neutral-600">
                                  {body}
                                </div>
                              )}
                              <div className="mt-1 text-[10px] text-neutral-500">
                                {format(parseISO(d.decided_at), "d MMMM yyyy", { locale: ru })}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {/* === SECTION 3: Decisions table === */}
                <div data-pdf-section className="mt-5" style={{ width: contentWidth }}>
                  <div className="text-[9px] uppercase tracking-[0.14em] text-neutral-500 mb-1.5 font-medium">
                    Решения и задачи · {tasks.length}
                  </div>
                  {tasks.length === 0 ? (
                    <div className="text-neutral-400 italic text-[11px] py-3">
                      Задачи не зафиксированы.
                    </div>
                  ) : (
                    <table
                      className="border-collapse text-[11px]"
                      style={{ width: contentWidth, tableLayout: "fixed" }}
                    >
                      <colgroup>
                        <col style={{ width: 28 }} />
                        {!groupByTopic && <col style={{ width: 90 }} />}
                        <col />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 75 }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-neutral-100 text-left text-neutral-700">
                          <th className="border border-neutral-300 px-2 py-1.5 text-center font-semibold">№</th>
                          {!groupByTopic && (
                            <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Тема</th>
                          )}
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Решение / задача</th>
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Ответственный</th>
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Срок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const colCount = groupByTopic ? 4 : 5;
                          const renderRow = (t: any, displayIdx: number, rowIdx: number) => {
                            const resp = respLabel(t.assigned_to);
                            const topic = getTaskTopic(t);
                            const desc = (t.description ?? "").trim();
                            return (
                              <tr key={t.id} className={rowIdx % 2 === 1 ? "bg-neutral-50/60" : ""}>
                                <td className="border border-neutral-300 px-2 py-1.5 text-center text-neutral-500 align-top">
                                  {displayIdx}
                                </td>
                                {!groupByTopic && (
                                  <td className="border border-neutral-300 px-2 py-1.5 align-top break-words text-neutral-700">
                                    {topic ? topic.name : <span className="text-neutral-400">—</span>}
                                  </td>
                                )}
                                <td className="border border-neutral-300 px-2 py-1.5 align-top break-words">
                                  <div className="text-sm font-medium text-neutral-900 leading-snug">{t.title}</div>
                                  {desc && (
                                    <div className="mt-1 text-xs leading-[1.4] text-neutral-500 line-clamp-2 whitespace-pre-wrap" title={desc}>
                                      {desc}
                                    </div>
                                  )}
                                </td>
                                <td className="border border-neutral-300 px-2 py-1.5 align-top break-words">
                                  {resp ?? <span className="text-neutral-400 italic">не назначен</span>}
                                </td>
                                <td className="border border-neutral-300 px-2 py-1.5 align-top text-neutral-700">
                                  {t.deadline
                                    ? format(parseISO(t.deadline), "d MMM yyyy", { locale: ru })
                                    : <span className="text-neutral-400">—</span>}
                                </td>
                              </tr>
                            );
                          };

                          if (!groupByTopic) {
                            return tasks.map((t, i) => renderRow(t, i + 1, i));
                          }

                          // Группировка по теме с сохранением порядка появления
                          const buckets = new Map<string, { topic: any; rows: any[] }>();
                          for (const t of tasks) {
                            const topic = getTaskTopic(t);
                            const key = topic?.id ?? "__no_topic__";
                            if (!buckets.has(key)) buckets.set(key, { topic, rows: [] });
                            buckets.get(key)!.rows.push(t);
                          }
                          const out: JSX.Element[] = [];
                          let runningIdx = 0;
                          let rowIdx = 0;
                          for (const [key, { topic, rows }] of buckets) {
                            out.push(
                              <tr key={`hdr-${key}`} className="bg-neutral-200/70">
                                <td colSpan={colCount} className="border border-neutral-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-700">
                                  {topic ? topic.name : "Без темы"} · {rows.length}
                                </td>
                              </tr>
                            );
                            // Living protocols: render topic notes (markdown bullets) under the header.
                            if (isLiving && topic) {
                              const note = (topicNotes[topic.id] ?? "").trim();
                              if (note) {
                                const bullets = note
                                  .split("\n")
                                  .map((ln) => ln.replace(/^\s*[-*•]\s+/, "").trim())
                                  .filter(Boolean);
                                out.push(
                                  <tr key={`notes-${key}`} className="bg-neutral-50">
                                    <td colSpan={colCount} className="border border-neutral-300 px-3 py-2 text-[11px] text-neutral-700">
                                      <div className="text-[9px] uppercase tracking-wide text-neutral-500 mb-1 font-medium">
                                        Основные выводы
                                      </div>
                                      <ul className="list-disc pl-4 space-y-0.5">
                                        {bullets.map((b, i) => (
                                          <li key={i}>{b}</li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>,
                                );
                              }
                            }
                            for (const t of rows) {
                              runningIdx += 1;
                              out.push(renderRow(t, runningIdx, rowIdx));
                              rowIdx += 1;
                            }
                          }
                          return out;
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* === SECTION 4: Signatures + footer === */}
                {!isInternalStyle && (
                  <div data-pdf-section className="mt-8" style={{ width: contentWidth }}>
                    <div className="grid grid-cols-2 gap-10">
                      <div>
                        <div className="border-t border-neutral-400 pt-1.5 text-[10px] text-neutral-500">
                          Подпись · {ourSideName}
                        </div>
                      </div>
                      {partnerName && (
                        <div>
                          <div className="border-t border-neutral-400 pt-1.5 text-[10px] text-neutral-500">
                            Подпись · {partnerName}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="email" className="flex-1 overflow-auto m-0 bg-muted/40 p-6">
            <div className="mx-auto max-w-3xl bg-white rounded-lg shadow-sm border border-neutral-200 p-8">
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-neutral-800">
                {emailText}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
