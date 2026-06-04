import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Search, Send, Paperclip, Phone, Mail, MapPin, Star, CheckSquare,
  TrendingUp, TrendingDown, Target, Clock, AlertTriangle, FileText,
  ListChecks, BarChart3, MessageSquare, UserCheck, ChevronRight,
  Sparkles, CircleDot, Plus, CalendarClock, Building2,
} from "lucide-react";

/**
 * STANDALONE MOCKUP — /dev/crm-chat
 *
 * Proposal: «CRM-коммуникация через внутренний чат».
 * Принцип: 1 клиент = 1 чат. Вся работа по клиенту (переписка, задачи,
 * показатели, поручения, протоколы) собирается в едином окне-диалоге
 * с вкладками и контекстными сайдбарами. Это «end-to-end» сценарий
 * использования JTD: протокол → задача → поручение → показатель — всё
 * в одной ленте по клиенту.
 *
 * Полностью на фейковых данных, ничего не пишет в БД.
 */

// ─────────────────────────── fake data ───────────────────────────

type Client = {
  id: string;
  name: string;
  emoji: string;
  territory: string;
  rank: "A" | "B" | "C";
  stage: string;
  stageColor: string;
  manager: string;
  last: string;
  time: string;
  unread: number;
  online?: boolean;
};

const CLIENTS: Client[] = [
  { id: "1", name: "Магнит", emoji: "🧲", territory: "ЦФО", rank: "A", stage: "Переговоры", stageColor: "tag-purple", manager: "Ира К.", last: "Создана задача: подготовить КП по новой линейке", time: "14:32", unread: 3, online: true },
  { id: "2", name: "Пятёрочка", emoji: "🖐", territory: "ЦФО", rank: "A", stage: "Старт отгрузок", stageColor: "tag-green", manager: "Олег В.", last: "Спасибо! Образцы получили, передали в категорию", time: "12:10", unread: 0, online: true },
  { id: "3", name: "Лента", emoji: "🎗", territory: "СЗФО", rank: "B", stage: "Получить ОС", stageColor: "tag-orange", manager: "Ира К.", last: "Поручение: согласовать матрицу до пятницы", time: "Вчера", unread: 1 },
  { id: "4", name: "ВкусВилл", emoji: "🥦", territory: "ЦФО", rank: "B", stage: "Отправить КП", stageColor: "tag-blue", manager: "Марк С.", last: "Показатель: средний чек вырос на 8%", time: "Вчера", unread: 0 },
  { id: "5", name: "Ашан", emoji: "🛒", territory: "ЦФО", rank: "C", stage: "Отправить образцы", stageColor: "tag-teal", manager: "Олег В.", last: "Когда сможем созвониться по ассортименту?", time: "Пн", unread: 0 },
];

type Msg =
  | { kind: "msg"; id: string; from: "them" | "me"; author: string; text: string; time: string }
  | { kind: "system"; id: string; variant: "task" | "assignment" | "metric" | "protocol"; text: string; meta?: string; time: string }
  | { kind: "date"; id: string; label: string };

const THREAD: Msg[] = [
  { kind: "date", id: "d1", label: "Сегодня" },
  { kind: "system", id: "p1", variant: "protocol", text: "Протокол встречи «Запуск новой линейки» опубликован", meta: "5 решений · 3 задачи", time: "09:15" },
  { kind: "msg", id: "m1", from: "them", author: "Анна (Магнит)", text: "Доброе утро! Получили вашу презентацию, выглядит интересно. Подготовьте, пожалуйста, коммерческое предложение по новой линейке.", time: "10:02" },
  { kind: "msg", id: "m2", from: "me", author: "Ира К.", text: "Доброе! Спасибо за обратную связь 🙌 Заведу задачу, КП будет до конца недели.", time: "10:05" },
  { kind: "system", id: "s1", variant: "task", text: "Подготовить КП по новой линейке", meta: "Ира К. · до 06.06 · Переговоры", time: "10:06" },
  { kind: "system", id: "s2", variant: "assignment", text: "Поручение: рассчитать рентабельность по 4 SKU", meta: "→ Олег В. · до 05.06", time: "10:07" },
  { kind: "msg", id: "m3", from: "them", author: "Анна (Магнит)", text: "Отлично. Ещё уточните условия по логистике для СЗФО.", time: "11:20" },
  { kind: "system", id: "s3", variant: "metric", text: "Средний чек по сети вырос на 8% за месяц", meta: "₽1 240 → ₽1 339", time: "13:00" },
  { kind: "msg", id: "m4", from: "me", author: "Ира К.", text: "Принято, добавил в задачу. По логистике подключу коллег.", time: "14:30" },
  { kind: "system", id: "s4", variant: "task", text: "Согласовать условия логистики (СЗФО)", meta: "Марк С. · до 09.06 · Переговоры", time: "14:32" },
];

const TABS = [
  { key: "chat", label: "Обсуждение", icon: MessageSquare },
  { key: "tasks", label: "Задачи", icon: ListChecks, count: 4 },
  { key: "metrics", label: "Показатели", icon: BarChart3 },
  { key: "assignments", label: "Поручения", icon: UserCheck, count: 2 },
] as const;

const TASKS = [
  { title: "Подготовить КП по новой линейке", stage: "Переговоры", due: "06.06", who: "Ира К.", done: false, overdue: false },
  { title: "Согласовать условия логистики (СЗФО)", stage: "Переговоры", due: "09.06", who: "Марк С.", done: false, overdue: false },
  { title: "Отправить образцы 4 SKU", stage: "Образцы", due: "02.06", who: "Олег В.", done: false, overdue: true },
  { title: "Презентация продукта проведена", stage: "КП", due: "28.05", who: "Ира К.", done: true, overdue: false },
];

const ASSIGNMENTS = [
  { title: "Рассчитать рентабельность по 4 SKU", to: "Олег В.", due: "05.06", status: "В работе" },
  { title: "Подготовить договор поставки", to: "Юрид. отдел", due: "10.06", status: "Ожидание" },
];

const METRICS = [
  { label: "Выручка / мес", value: "₽4.2М", delta: "+12%", up: true, icon: TrendingUp },
  { label: "Средний чек", value: "₽1 339", delta: "+8%", up: true, icon: BarChart3 },
  { label: "Активные SKU", value: "37", delta: "+4", up: true, icon: Building2 },
  { label: "Дебиторка", value: "₽310К", delta: "−5%", up: false, icon: TrendingDown },
];

// ─────────────────────────── helpers ───────────────────────────

const sysStyles: Record<string, { ring: string; chip: string; icon: typeof CheckSquare; label: string }> = {
  task: { ring: "border-tag-blue/30 bg-tag-blue/5", chip: "bg-tag-blue/15 text-tag-blue", icon: CheckSquare, label: "Создана задача" },
  assignment: { ring: "border-tag-purple/30 bg-tag-purple/5", chip: "bg-tag-purple/15 text-tag-purple", icon: UserCheck, label: "Поручение" },
  metric: { ring: "border-tag-green/30 bg-tag-green/5", chip: "bg-tag-green/15 text-tag-green", icon: TrendingUp, label: "Показатель" },
  protocol: { ring: "border-tag-orange/30 bg-tag-orange/5", chip: "bg-tag-orange/15 text-tag-orange", icon: FileText, label: "Протокол" },
};

function rankColor(r: string) {
  return r === "A" ? "bg-tag-green/15 text-tag-green" : r === "B" ? "bg-tag-orange/15 text-tag-orange" : "bg-muted text-muted-foreground";
}

// ─────────────────────────── component ───────────────────────────

export default function CrmChatDemo() {
  const [activeClient, setActiveClient] = useState("1");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("chat");
  const client = CLIENTS.find((c) => c.id === activeClient)!;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Concept banner */}
      <div className="shrink-0 border-b border-border bg-gradient-to-r from-cyan-500/10 via-primary/5 to-violet-500/10 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight">
              Концепт · CRM-коммуникация через внутренний чат
            </div>
            <div className="text-xs text-muted-foreground truncate">
              1 клиент = 1 чат с вкладками. Переписка, задачи, поручения, показатели и протоколы — в одной ленте.
            </div>
          </div>
          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">Макет · фейковые данные</Badge>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── LEFT: client list (1 client = 1 chat) ── */}
        <aside className="w-80 shrink-0 border-r border-border flex flex-col bg-sidebar-bg/40">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Поиск клиента…" className="pl-8 h-9 bg-background" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setActiveClient(c.id); setTab("chat"); }}
                  className={cn(
                    "w-full text-left rounded-xl px-2.5 py-2.5 flex gap-3 transition-colors",
                    c.id === activeClient ? "bg-primary/10" : "hover:bg-muted/60"
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-muted to-secondary flex items-center justify-center text-xl">
                      {c.emoji}
                    </div>
                    {c.online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-tag-green border-2 border-background" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{c.name}</span>
                      <span className={cn("text-[10px] font-bold px-1 rounded", rankColor(c.rank))}>{c.rank}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{c.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", `bg-${c.stageColor}/15 text-${c.stageColor}`)}>
                        {c.stage}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">{c.last}</span>
                    </div>
                  </div>
                  {c.unread > 0 && (
                    <span className="self-center shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                      {c.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* ── CENTER: chat with tabs ── */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* header */}
          <div className="shrink-0 px-4 py-3 border-b border-border flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-muted to-secondary flex items-center justify-center text-lg shrink-0">
              {client.emoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight">{client.name}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", `bg-${client.stageColor}/15 text-${client.stageColor}`)}>{client.stage}</span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> {client.territory}
                <span className="text-border">·</span>
                <UserCheck className="h-3 w-3" /> {client.manager}
              </div>
            </div>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"><Mail className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* tabs */}
          <div className="shrink-0 flex items-center gap-1 px-3 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {"count" in t && t.count ? (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-muted text-[10px] font-bold flex items-center justify-center">{t.count}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* tab content */}
          {tab === "chat" && <ChatTab />}
          {tab === "tasks" && <TasksTab />}
          {tab === "metrics" && <MetricsTab />}
          {tab === "assignments" && <AssignmentsTab />}
        </main>

        {/* ── RIGHT: context sidebar ── */}
        <aside className="w-80 shrink-0 border-l border-border hidden xl:flex flex-col bg-sidebar-bg/40">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-5">
              {/* client card */}
              <div className="text-center">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-muted to-secondary flex items-center justify-center text-3xl mb-2">{client.emoji}</div>
                <div className="font-bold">{client.name}</div>
                <div className="text-xs text-muted-foreground">{client.territory} · Ранг {client.rank}</div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <InfoRow icon={Phone} text="+7 495 123-45-67" />
                <InfoRow icon={Mail} text="anna@magnit.ru" />
                <InfoRow icon={UserCheck} text={client.manager} />
                <InfoRow icon={Building2} text="Сеть FMCG" />
              </div>

              {/* funnel progress */}
              <Section title="Стадия воронки">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Переговоры</span>
                  <span className="font-semibold">4 / 5</span>
                </div>
                <Progress value={80} className="h-1.5" />
              </Section>

              {/* key metrics */}
              <Section title="Показатели" action="Все">
                <div className="grid grid-cols-2 gap-2">
                  {METRICS.slice(0, 4).map((m) => (
                    <div key={m.label} className="rounded-xl border border-border bg-card p-2.5">
                      <div className="text-[10px] text-muted-foreground">{m.label}</div>
                      <div className="text-sm font-bold">{m.value}</div>
                      <div className={cn("text-[10px] font-medium", m.up ? "text-tag-green" : "text-destructive")}>{m.delta}</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* main tasks */}
              <Section title="Основные задачи" action="4">
                <div className="space-y-1.5">
                  {TASKS.slice(0, 3).map((t) => (
                    <div key={t.title} className="flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      {t.done
                        ? <CheckSquare className="h-3.5 w-3.5 text-tag-green mt-0.5 shrink-0" />
                        : <CircleDot className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", t.overdue ? "text-destructive" : "text-muted-foreground")} />}
                      <div className="min-w-0">
                        <div className={cn("truncate", t.done && "line-through text-muted-foreground")}>{t.title}</div>
                        <div className={cn("text-[10px]", t.overdue ? "text-destructive" : "text-muted-foreground")}>
                          {t.overdue ? "⚠ просрочено · " : ""}{t.who} · {t.due}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* assignments */}
              <Section title="Поручения" action="2">
                <div className="space-y-1.5">
                  {ASSIGNMENTS.map((a) => (
                    <div key={a.title} className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs">
                      <div className="font-medium truncate">{a.title}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" /> {a.to} · до {a.due}
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-tag-purple/15 text-tag-purple">{a.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* documents */}
              <Section title="Документы">
                <div className="space-y-1">
                  {["КП_новая_линейка.pdf", "Договор_поставки_2026.docx", "Протокол_встречи_03.06.pdf"].map((d) => (
                    <div key={d} className="flex items-center gap-2 text-xs text-primary hover:underline cursor-pointer">
                      <FileText className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────── tabs ───────────────────────────

function ChatTab() {
  return (
    <>
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {THREAD.map((m) => {
            if (m.kind === "date") {
              return (
                <div key={m.id} className="flex justify-center my-2">
                  <span className="text-[11px] text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">{m.label}</span>
                </div>
              );
            }
            if (m.kind === "system" || m.kind === "protocol" || m.kind === "task" || m.kind === "assignment" || m.kind === "metric") {
              const variant = (m as any).variant ?? m.kind;
              const s = sysStyles[variant];
              const Icon = s.icon;
              return (
                <div key={m.id} className="flex justify-center">
                  <button className={cn("group flex items-center gap-2.5 rounded-xl border px-3 py-2 max-w-md w-full text-left transition-colors hover:brightness-105", s.ring)}>
                    <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", s.chip)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</div>
                      <div className="text-sm font-medium truncate">{(m as any).text}</div>
                      {(m as any).meta && <div className="text-[11px] text-muted-foreground truncate">{(m as any).meta}</div>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                </div>
              );
            }
            const mine = m.from === "me";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2", mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>
                  {!mine && <div className="text-[11px] font-semibold text-tag-purple mb-0.5">{m.author}</div>}
                  <div className="text-sm leading-snug whitespace-pre-wrap">{m.text}</div>
                  <div className={cn("text-[10px] mt-0.5 text-right", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{m.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
      {/* composer */}
      <div className="shrink-0 border-t border-border p-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0"><Plus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0"><Paperclip className="h-4 w-4" /></Button>
          <Input placeholder="Сообщение или /задача, /поручение…" className="h-10 bg-background" />
          <Button size="icon" className="h-10 w-10 shrink-0"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </>
  );
}

function TasksTab() {
  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-5 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Задачи по клиенту</h3>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus className="h-3 w-3" /> Задача</Button>
        </div>
        {TASKS.map((t) => (
          <div key={t.title} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            {t.done
              ? <CheckSquare className="h-4 w-4 text-tag-green shrink-0" />
              : <CircleDot className={cn("h-4 w-4 shrink-0", t.overdue ? "text-destructive" : "text-muted-foreground")} />}
            <div className="min-w-0 flex-1">
              <div className={cn("text-sm truncate", t.done && "line-through text-muted-foreground")}>{t.title}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded-full bg-muted">{t.stage}</span>
                <UserCheck className="h-3 w-3" /> {t.who}
                <CalendarClock className="h-3 w-3" /> <span className={cn(t.overdue && "text-destructive font-medium")}>{t.overdue ? "⚠ " : ""}{t.due}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function MetricsTab() {
  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-5 space-y-4">
        <h3 className="text-sm font-semibold">Показатели клиента</h3>
        <div className="grid grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><m.icon className="h-4 w-4 text-primary" /></span>
                <span className={cn("text-xs font-semibold", m.up ? "text-tag-green" : "text-destructive")}>{m.delta}</span>
              </div>
              <div className="text-2xl font-bold mt-2">{m.value}</div>
              <div className="text-xs text-muted-foreground">{m.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3"><Target className="h-4 w-4 text-primary" /> Прогресс по плану продаж</div>
          {[
            { label: "План квартала", v: 72 },
            { label: "Ввод новых SKU", v: 90 },
            { label: "Погашение дебиторки", v: 45 },
          ].map((r) => (
            <div key={r.label} className="mb-2.5 last:mb-0">
              <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">{r.label}</span><span className="font-semibold">{r.v}%</span></div>
              <Progress value={r.v} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function AssignmentsTab() {
  return (
    <ScrollArea className="flex-1">
      <div className="max-w-2xl mx-auto p-5 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">Поручения по клиенту</h3>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus className="h-3 w-3" /> Поручение</Button>
        </div>
        {ASSIGNMENTS.map((a) => (
          <div key={a.title} className="rounded-xl border border-border bg-card px-3 py-3">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-tag-purple shrink-0" />
              <div className="text-sm font-medium flex-1 truncate">{a.title}</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-tag-purple/15 text-tag-purple shrink-0">{a.status}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-2 pl-6">
              <span>Исполнитель: <b className="text-foreground font-medium">{a.to}</b></span>
              <Clock className="h-3 w-3" /> до {a.due}
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          Поручения делегируются на 1 уровень и попадают в чат клиента автоматически
        </div>
      </div>
    </ScrollArea>
  );
}

// ─────────────────────────── small ui ───────────────────────────

function Section({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        {action && <span className="text-[11px] text-primary cursor-pointer hover:underline">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, text }: { icon: typeof Phone; text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-card border border-border px-2 py-1.5 text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}