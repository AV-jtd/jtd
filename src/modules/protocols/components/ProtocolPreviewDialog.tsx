import { useMemo, useRef, useState } from "react";
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

export default function ProtocolPreviewDialog({ protocolId, open, onOpenChange }: Props) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();

  const protocol = useMemo(() => groups.find((g) => g.id === protocolId), [groups, protocolId]);
  const meta: any = (protocol as any)?.protocol_meta ?? {};
  const sides = useMemo(() => parseProtocolSides(protocol?.name), [protocol?.name]);
  const ourSideName = meta.our_side_name?.trim() || sides?.ours || "Дороничи";
  const partnerName = sides?.partner || null;

  // CRM client (for partner logo)
  const linkedClientId: string | null = meta.client_id ?? null;
  const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
  useMemo(() => {
    if (!linkedClientId) {
      setClientLogoUrl(null);
      return;
    }
    supabase
      .from("clients")
      .select("logo_url")
      .eq("id", linkedClientId)
      .maybeSingle()
      .then(({ data }) => setClientLogoUrl((data as any)?.logo_url ?? null));
  }, [linkedClientId]);

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
    if (!id) return "—";
    const u = users.find((x: any) => x.id === id);
    return u?.display_name || u?.username || u?.email || "—";
  };

  const meetingDateLabel = meta.meeting_date
    ? format(parseISO(meta.meeting_date), "d MMMM yyyy", { locale: ru })
    : "—";

  const formatLabel = FORMAT_LABEL[meta.format ?? "offline"] ?? "Офлайн";

  const externals: Array<{ name: string; organization?: string; role?: string }> =
    meta.external_attendees ?? [];

  // ---------- Build Email text ----------
  const emailText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Тема: Протокол встречи — ${protocol?.name ?? ""}`);
    lines.push("");
    lines.push(`Дата: ${meetingDateLabel}`);
    lines.push(`Формат: ${formatLabel}`);
    lines.push("");
    lines.push(`Участники со стороны ${ourSideName}:`);
    if (internalAttendeeIds.length === 0) lines.push("  — (не указаны)");
    else internalAttendeeIds.forEach((id) => lines.push(`  • ${userName(id)}`));
    lines.push("");
    if (partnerName) {
      lines.push(`Участники со стороны ${partnerName}:`);
      if (externals.length === 0) lines.push("  — (не указаны)");
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
      lines.push("  — (нет задач)");
    } else {
      tasks.forEach((t, i) => {
        const dl = t.deadline
          ? format(parseISO(t.deadline), "d MMM yyyy", { locale: ru })
          : "без срока";
        lines.push(`  ${i + 1}. ${t.title}`);
        lines.push(`      Ответственный: ${userName(t.assigned_to)} · Срок: ${dl}`);
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

  const handleDownloadPdf = async () => {
    if (!a4Ref.current) return;
    setBusyPdf(true);
    try {
      const canvas = await html2canvas(a4Ref.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      let y = 0;
      let remaining = imgH;
      // Multi-page: paste the same big image and shift y
      while (remaining > 0) {
        pdf.addImage(imgData, "JPEG", 0, y === 0 ? 0 : -(imgH - remaining), imgW, imgH);
        remaining -= pageH;
        if (remaining > 0) {
          pdf.addPage();
          y += pageH;
        }
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
      // HTML-safe email-text (escape <>&)
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

          <TabsContent value="document" className="flex-1 overflow-auto m-0 bg-muted/40 p-6">
            {/* A4: 210mm * (96/25.4) ≈ 794px @96dpi */}
            <div className="mx-auto bg-white shadow-lg" style={{ width: 794, minHeight: 1123 }}>
              <div ref={a4Ref} className="p-12 text-[12px] leading-[1.5] text-neutral-900" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                {/* Header with logos */}
                <div className="flex items-start justify-between gap-6 pb-5 border-b-2 border-neutral-900">
                  <div className="flex items-center gap-3">
                    <img src={ourLogo} alt="" className="h-12 w-12 object-contain rounded" crossOrigin="anonymous" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">Наша сторона</div>
                      <div className="text-sm font-semibold">{ourSideName}</div>
                    </div>
                  </div>
                  {partnerName && (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Сторона партнёра</div>
                        <div className="text-sm font-semibold">{partnerName}</div>
                      </div>
                      {clientLogoUrl ? (
                        <img src={clientLogoUrl} alt="" className="h-12 w-12 object-contain rounded" crossOrigin="anonymous" />
                      ) : (
                        <div className="h-12 w-12 rounded bg-neutral-200 flex items-center justify-center text-neutral-500 text-sm font-semibold">
                          {partnerName.charAt(0)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className="mt-6 mb-5">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Протокол встречи</div>
                  <h1 className="text-xl font-bold leading-tight">{protocol.name}</h1>
                  <div className="mt-2 text-[11px] text-neutral-600">
                    Дата: <span className="font-medium text-neutral-900">{meetingDateLabel}</span>
                    <span className="mx-2 text-neutral-300">·</span>
                    Формат: <span className="font-medium text-neutral-900">{formatLabel}</span>
                  </div>
                </div>

                {/* Attendees */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
                      Участники: {ourSideName}
                    </div>
                    {internalAttendeeIds.length === 0 ? (
                      <div className="text-neutral-400 italic text-[11px]">не указаны</div>
                    ) : (
                      <ul className="space-y-0.5">
                        {internalAttendeeIds.map((id) => (
                          <li key={id} className="text-[12px]">• {userName(id)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {partnerName && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5 font-semibold">
                        Участники: {partnerName}
                      </div>
                      {externals.length === 0 ? (
                        <div className="text-neutral-400 italic text-[11px]">не указаны</div>
                      ) : (
                        <ul className="space-y-0.5">
                          {externals.map((e, i) => (
                            <li key={i} className="text-[12px]">
                              • {e.name}
                              {e.role && <span className="text-neutral-500">, {e.role}</span>}
                              {e.organization && <span className="text-neutral-500"> ({e.organization})</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Decisions table */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2 font-semibold">
                    Решения и задачи
                  </div>
                  {tasks.length === 0 ? (
                    <div className="text-neutral-400 italic text-[11px] py-3">Задачи не зафиксированы.</div>
                  ) : (
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-neutral-100 text-left text-neutral-700">
                          <th className="border border-neutral-300 px-2 py-1.5 w-8 text-center">№</th>
                          <th className="border border-neutral-300 px-2 py-1.5">Решение / задача</th>
                          <th className="border border-neutral-300 px-2 py-1.5 w-44">Ответственный</th>
                          <th className="border border-neutral-300 px-2 py-1.5 w-28">Срок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((t, i) => (
                          <tr key={t.id}>
                            <td className="border border-neutral-300 px-2 py-1.5 text-center text-neutral-500">{i + 1}</td>
                            <td className="border border-neutral-300 px-2 py-1.5 align-top">{t.title}</td>
                            <td className="border border-neutral-300 px-2 py-1.5 align-top">{userName(t.assigned_to)}</td>
                            <td className="border border-neutral-300 px-2 py-1.5 align-top whitespace-nowrap">
                              {t.deadline ? format(parseISO(t.deadline), "d MMM yyyy", { locale: ru }) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Signatures */}
                <div className="mt-10 grid grid-cols-2 gap-12">
                  <div>
                    <div className="border-t border-neutral-400 pt-1 text-[10px] text-neutral-500">
                      Подпись · {ourSideName}
                    </div>
                  </div>
                  {partnerName && (
                    <div>
                      <div className="border-t border-neutral-400 pt-1 text-[10px] text-neutral-500">
                        Подпись · {partnerName}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-12 pt-3 border-t border-neutral-200 text-[9px] text-neutral-400 text-center">
                  Сформировано в JustTODOit · {format(new Date(), "d MMMM yyyy, HH:mm", { locale: ru })}
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
