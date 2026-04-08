import { useState } from "react";
import {
  Sparkles, ChevronDown, ChevronUp, Target, Plus, Inbox, Clock,
  TrendingUp, CheckCircle2, ArrowRight, User, Send, Eye, CalendarDays,
  Star, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Static mock data ─── */
const ROLE_CELLS = [
  { label: "Я ответственный", count: 12, color: "hsl(var(--tag-purple))", bg: "hsl(var(--tag-purple) / .1)" },
  { label: "Мне поручено", count: 8, color: "hsl(var(--primary))", bg: "hsl(var(--primary) / .1)" },
  { label: "Я поручил", count: 5, color: "hsl(var(--success))", bg: "hsl(var(--success) / .1)" },
  { label: "Просрочено", count: 3, color: "hsl(var(--destructive))", bg: "hsl(var(--destructive) / .1)" },
  { label: "Drift", count: "+4д", color: "hsl(var(--warning))", bg: "hsl(var(--warning) / .1)" },
  { label: "Выполнено", count: 2, color: "hsl(var(--tag-teal))", bg: "hsl(var(--tag-teal) / .1)" },
];

const INBOX_TASKS = [
  { title: "Подготовить ТЗ для упаковки", time: "14:32", isNew: true },
  { title: "Ответить по запросу клиента Альфа", time: "09:15", isNew: true },
  { title: "Проверить макет лендинга", time: "вчера", isNew: false },
  { title: "Уточнить цены у поставщика", time: "2 дня назад", isNew: false },
  { title: "Обновить презентацию партнёра", time: "3 дня назад", isNew: false },
  { title: "Запросить образцы материалов", time: "4 дня назад", isNew: false },
  { title: "Добавить контакт дистрибьютора", time: "5 дней назад", isNew: false },
];

const MY_DAY_TASKS = [
  { title: "Финализировать бриф VibeSandwich", project: "VibeSandwich", assignee: "Я", deadline: "сегодня", overdue: false },
  { title: "Согласовать дизайн упаковки", project: "VibeSandwich", assignee: "Е. Соболева", deadline: "сегодня", overdue: false },
  { title: "Отправить счёт клиенту", project: "CRM", assignee: "Я", deadline: "вчера", overdue: true },
  { title: "Ревью задач по NPD Gate 2", project: "NPD Pipeline", assignee: "Я", deadline: "завтра", overdue: false },
  { title: "Подготовить презентацию", project: "PMO", assignee: "А. Иванов", deadline: "пт", overdue: false },
  { title: "Обновить roadmap Q3", project: "PMO", assignee: "Я", deadline: "пн", overdue: false },
  { title: "Проверить отчёт по продажам", project: "CRM", assignee: "Я", deadline: "вт", overdue: false },
];

const FILTERS = ["Все", "Мне поручили", "Поручил я", "По ответственному", "По проекту", "По сроку"];

export default function HomeMockup() {
  const [aiExpanded, setAiExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState("Все");
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [inboxExpanded, setInboxExpanded] = useState(false);

  const visibleTasks = tasksExpanded ? MY_DAY_TASKS : MY_DAY_TASKS.slice(0, 5);
  const visibleInbox = inboxExpanded ? INBOX_TASKS : INBOX_TASKS.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      {/* Header placeholder */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3">
        <span className="font-bold text-lg text-foreground tracking-tight">JTD</span>
        <span className="text-muted-foreground text-sm">Home Mockup</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ═══ 1. AI ANALYSIS ═══ */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <button
            onClick={() => setAiExpanded(!aiExpanded)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground">Доброе утро, Александр</p>
                <p className="text-xs text-muted-foreground">Вторник, 7 апреля 2026</p>
              </div>
            </div>
            {aiExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {aiExpanded && (
            <>
              {/* Role grid */}
              <div className="px-5 pb-4 grid grid-cols-3 gap-2.5">
                {ROLE_CELLS.map((cell) => (
                  <button
                    key={cell.label}
                    className="rounded-lg p-3 text-left transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-transparent hover:border-border"
                    style={{ backgroundColor: cell.bg }}
                  >
                    <p className="text-2xl font-bold" style={{ color: cell.color }}>{cell.count}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5 leading-tight">{cell.label}</p>
                    
                  </button>
                ))}
              </div>

              {/* Focus line */}
              <div className="mx-5 mb-4 rounded-lg bg-muted/60 px-4 py-3 flex items-center gap-3">
                <Target className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-foreground flex-1">
                  <span className="font-medium">Фокус:</span> Согласуйте бриф VibeSandwich — дедлайн сегодня, 3 задачи зависят от него.
                </p>
                <ArrowRight className="h-4 w-4 text-primary shrink-0 cursor-pointer" />
              </div>
            </>
          )}
        </section>

        {/* ═══ 2. QUICK INPUT ═══ */}
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <Plus className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">Новая задача…</span>
          <div className="flex items-center gap-1.5">
            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><User className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /></div>
            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center"><Star className="h-3.5 w-3.5 text-muted-foreground" /></div>
          </div>
        </div>


        {/* ═══ 4. MY DAY ═══ */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Задачи</span>
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{MY_DAY_TASKS.length}</span>
            </div>
          </div>

          {/* Filters */}
          <div className="px-5 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors border",
                  activeFilter === f
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted/60"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-border">
            {visibleTasks.map((t, i) => (
              <li key={i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer">
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                  t.overdue ? "border-destructive" : "border-border"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">{t.project}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{t.assignee}</span>
                  </div>
                </div>
                <span className={cn(
                  "text-xs whitespace-nowrap",
                  t.overdue ? "text-destructive font-medium" : "text-muted-foreground"
                )}>
                  {t.deadline}
                </span>
              </li>
            ))}
          </ul>
          {MY_DAY_TASKS.length > 5 && (
            <div className="px-5 py-2.5 border-t border-border">
              <button onClick={() => setTasksExpanded(!tasksExpanded)} className="text-xs text-primary font-medium hover:underline">
                {tasksExpanded ? "Свернуть" : `Показать все ${MY_DAY_TASKS.length}`}
              </button>
            </div>
          )}
        </section>

        {/* ═══ 5. INBOX ═══ */}
        <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-muted/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-foreground">Новое. Не распределено</span>
            </div>
            <span className="text-xs font-semibold bg-warning/15 text-warning px-2 py-0.5 rounded-full">{INBOX_TASKS.length}</span>
          </div>
          <ul className="divide-y divide-border">
            {visibleInbox.map((t, i) => (
              <li key={i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer">
                <span className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  t.isNew ? "bg-primary" : "bg-muted-foreground/40"
                )} />
                <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{t.time}</span>
              </li>
            ))}
          </ul>
          {INBOX_TASKS.length > 5 && (
            <div className="px-5 py-2.5 border-t border-border">
              <button onClick={() => setInboxExpanded(!inboxExpanded)} className="text-xs text-primary font-medium hover:underline">
                {inboxExpanded ? "Свернуть" : `Показать все ${INBOX_TASKS.length}`}
              </button>
            </div>
          )}
        </section>

        <div className="h-8" />
      </div>
    </div>
  );
}
