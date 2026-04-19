import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Copy, Send, FileText, Mail, Loader2, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { useTaskGroups, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { parseProtocolSides } from "@/lib/protocolSides";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import ourLogoDefault from "@/assets/our-logo-default.jpg";

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
const A4_PADDING = 56; // ~14mm — компактнее, оставляет больше места таблице

export default function ProtocolPreviewDialog({ protocolId, open, onOpenChange }: Props) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();

  const protocol = useMemo(() => groups.find((g) => g.id === protocolId), [groups, protocolId]);
  const meta: any = (protocol as any)?.protocol_meta ?? {};
  const sides = useMemo(() => parseProtocolSides(protocol?.name), [protocol?.name]);

  // CRM client (для логотипа и имени партнёра)
  const linkedClientId: string | null = meta.client_id ?? null;
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
    lines.push(`Участники со стороны ${ourSideName}:`);
    if (internalAttendeeIds.length === 0) lines.push("  — не указаны");
    else internalAttendeeIds.forEach((id) => lines.push(`  • ${userName(id) ?? "—"}`));
    lines.push("");
    if (partnerName) {
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
    lines.push("Решения и задачи:");
    if (tasks.length === 0) {
      lines.push("  — нет задач");
    } else {
      tasks.forEach((t, i) => {
        const dl = t.deadline
          ? format(parseISO(t.deadline), "d MMM yyyy", { locale: ru })
          : "без срока";
        const resp = userName(t.assigned_to) ?? "не назначен";
        lines.push(`  ${i + 1}. ${t.title}`);
        lines.push(`      Ответственный: ${resp} · Срок: ${dl}`);
      });
    }
    lines.push("");
    lines.push("—");
    lines.push("Сформировано в JustTODOit");
    return lines.join("\n");
  }, [protocol?.name, meetingDateLabel, formatLabel, ourSideName, internalAttendeeIds, partnerName, externals, tasks, users]);

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

      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      let currentY = MARGIN_MM;
      const SECTION_GAP_MM = 3;

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

  const ourLogo = meta.our_logo_url || (protocol as any).logo_url || ourLogoDefault;
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
                {/* === SECTION 1: Title + Sides cards (matches ProtocolHeader layout) === */}
                <div data-pdf-section style={{ width: contentWidth }}>
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 mb-1">
                        Протокол встречи
                      </div>
                      <h1 className="text-[22px] font-semibold leading-tight text-neutral-900 break-words">
                        {protocol.name}
                      </h1>
                    </div>
                  </div>

                  {/* Meta chips: date + format */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] mb-4">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-700">
                      <span className="text-neutral-500">Дата:</span>
                      <span className="font-medium text-neutral-900">{meetingDateLabel}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-700">
                      <span className="text-neutral-500">Формат:</span>
                      <span className="font-medium text-neutral-900">{formatLabel}</span>
                    </span>
                  </div>

                  {/* Sides cards — same grid as ProtocolHeader */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: partnerName ? "1fr 1fr" : "1fr",
                    }}
                  >
                    {/* Our side */}
                    <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                      <img
                        src={ourLogo}
                        alt=""
                        className="h-12 w-12 rounded-lg object-cover ring-1 ring-neutral-200 shrink-0"
                        crossOrigin="anonymous"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 font-semibold">
                          Наша сторона
                        </div>
                        <div className="text-sm font-semibold text-neutral-900 truncate">
                          {ourSideName}
                        </div>
                        {internalAttendeeIds.length > 0 && (
                          <div className="mt-1.5 text-[10px] text-neutral-500">
                            {internalAttendeeIds.length}{" "}
                            {internalAttendeeIds.length === 1 ? "участник" : "участников"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Partner side */}
                    {partnerName && (
                      <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                        {clientLogoUrl ? (
                          <img
                            src={clientLogoUrl}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover ring-1 ring-neutral-200 shrink-0"
                            crossOrigin="anonymous"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-neutral-100 ring-1 ring-neutral-200 flex items-center justify-center text-neutral-500 text-base font-semibold shrink-0">
                            {partnerName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 font-semibold">
                            Сторона партнёра
                          </div>
                          <div className="text-sm font-semibold text-neutral-900 truncate">
                            {partnerName}
                          </div>
                          {externals.length > 0 && (
                            <div className="mt-1.5 text-[10px] text-neutral-500">
                              {externals.length}{" "}
                              {externals.length === 1 ? "участник" : "участников"}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* === SECTION 2: Attendees === */}
                <div data-pdf-section className="mt-6" style={{ width: contentWidth }}>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="rounded border border-neutral-200 bg-neutral-50/40 p-3">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 mb-1.5 font-semibold">
                        Участники · {ourSideName}
                      </div>
                      {internalAttendeeIds.length === 0 ? (
                        <div className="text-neutral-400 italic text-[11px]">не указаны</div>
                      ) : (
                        <ul className="space-y-0.5">
                          {internalAttendeeIds.map((id) => (
                            <li key={id} className="text-[12px] break-words">
                              • {userName(id) ?? "—"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {partnerName && (
                      <div className="rounded border border-neutral-200 bg-neutral-50/40 p-3">
                        <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 mb-1.5 font-semibold">
                          Участники · {partnerName}
                        </div>
                        {externals.length === 0 ? (
                          <div className="text-neutral-400 italic text-[11px]">не указаны</div>
                        ) : (
                          <ul className="space-y-0.5">
                            {externals.map((e, i) => (
                              <li key={i} className="text-[12px] break-words">
                                • {e.name}
                                {e.role && <span className="text-neutral-500">, {e.role}</span>}
                                {e.organization && (
                                  <span className="text-neutral-500"> ({e.organization})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* === SECTION 3: Decisions table === */}
                <div data-pdf-section className="mt-6" style={{ width: contentWidth }}>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-neutral-500 mb-2 font-semibold">
                    Решения и задачи
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
                        <col />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 80 }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-neutral-100 text-left text-neutral-700">
                          <th className="border border-neutral-300 px-2 py-1.5 text-center font-semibold">№</th>
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Решение / задача</th>
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Ответственный</th>
                          <th className="border border-neutral-300 px-2 py-1.5 font-semibold">Срок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t, i) => {
                          const resp = userName(t.assigned_to);
                          return (
                            <tr key={t.id} className={i % 2 === 1 ? "bg-neutral-50/60" : ""}>
                              <td className="border border-neutral-300 px-2 py-1.5 text-center text-neutral-500 align-top">
                                {i + 1}
                              </td>
                              <td className="border border-neutral-300 px-2 py-1.5 align-top break-words">
                                {t.title}
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
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* === SECTION 4: Signatures + footer === */}
                <div data-pdf-section className="mt-10" style={{ width: contentWidth }}>
                  <div className="grid grid-cols-2 gap-12">
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

                  <div className="mt-10 pt-3 border-t border-neutral-200 text-[9px] text-neutral-400 text-center">
                    Сформировано в JustTODOit · {format(new Date(), "d MMMM yyyy, HH:mm", { locale: ru })}
                  </div>
                </div>
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
