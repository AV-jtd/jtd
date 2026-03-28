import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileText, ChevronRight, Plus, Link2, BarChart3, Target, AlertTriangle,
  Users, Calendar, CheckCircle2, ArrowLeft, BookOpen, LayoutGrid, StickyNote,
  Edit3, Hash, ExternalLink, TrendingUp, Clock, Sparkles
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

// ─── Fake data ───
const fakePages = [
  { id: "1", title: "Обзор проекта", icon: "📋", children: [
    { id: "1a", title: "Цели и KPI", icon: "🎯" },
    { id: "1b", title: "Стейкхолдеры", icon: "👥" },
  ]},
  { id: "2", title: "Техническая документация", icon: "⚙️", children: [
    { id: "2a", title: "Архитектура", icon: "🏗️" },
    { id: "2b", title: "API спецификация", icon: "🔌" },
  ]},
  { id: "3", title: "Риски и митигации", icon: "⚠️", children: [] },
  { id: "4", title: "Протоколы встреч", icon: "📝", children: [
    { id: "4a", title: "Встреча 15.03", icon: "📅" },
    { id: "4b", title: "Встреча 22.03", icon: "📅" },
  ]},
];

// ─── Variant 1: Wiki Pages (Notion-style) ───
function WikiPagesVariant() {
  const [selectedPage, setSelectedPage] = useState("1");
  return (
    <div className="flex h-[520px] border rounded-xl overflow-hidden bg-background">
      {/* Sidebar navigation */}
      <div className="w-56 border-r bg-muted/30 p-3 flex flex-col gap-1">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Страницы</span>
          <Button variant="ghost" size="icon" className="h-5 w-5"><Plus className="h-3 w-3" /></Button>
        </div>
        {fakePages.map(page => (
          <div key={page.id}>
            <button
              onClick={() => setSelectedPage(page.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                selectedPage === page.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
              }`}
            >
              <span>{page.icon}</span>
              <span className="truncate">{page.title}</span>
            </button>
            {page.children.length > 0 && (
              <div className="ml-5 border-l border-border/50 pl-2 mt-0.5">
                {page.children.map(child => (
                  <button
                    key={child.id}
                    onClick={() => setSelectedPage(child.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
                      selectedPage === child.id ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <span>{child.icon}</span>
                    <span className="truncate">{child.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Page content */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <span>🚀 Проект Alpha</span>
            <ChevronRight className="h-3 w-3" />
            <span>📋 Обзор проекта</span>
          </div>

          <h1 className="text-2xl font-bold mb-1 flex items-center gap-3">
            📋 Обзор проекта
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">Последнее обновление: 26 марта 2026 · Автор: Ирина К.</p>

          {/* Embedded dashboard widget */}
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Встроенный дашборд</span>
                <Badge variant="outline" className="text-[10px] ml-auto">Live</Badge>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Прогресс", value: "68%", color: "text-green-600" },
                  { label: "Задач", value: "24/35", color: "text-blue-600" },
                  { label: "Просрочено", value: "3", color: "text-red-500" },
                  { label: "Участников", value: "8", color: "text-purple-600" },
                ].map(m => (
                  <div key={m.label} className="text-center">
                    <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
                    <div className="text-[10px] text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
              <Progress value={68} className="h-1.5 mt-3" />
            </CardContent>
          </Card>

          {/* Markdown-style content */}
          <div className="prose prose-sm dark:prose-invert">
            <h2 className="text-lg font-semibold mt-6 mb-2">Описание</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Проект направлен на разработку нового модуля управления проектами с интеграцией 
              ИИ-аналитики и автоматизации рутинных процессов.
            </p>

            <h2 className="text-lg font-semibold mt-6 mb-2">Ключевые цели</h2>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <span>Запуск MVP к Q2 2026</span>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <span>Интеграция с 3 внешними сервисами</span>
              </li>
              <li className="flex items-start gap-2">
                <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>Покрытие тестами &gt;80%</span>
              </li>
            </ul>

            {/* Task reference */}
            <h2 className="text-lg font-semibold mt-6 mb-2">Связанные задачи</h2>
            <div className="space-y-1.5">
              {[
                { title: "Подготовить ТЗ для дизайнера", status: "done", assignee: "Марк" },
                { title: "Провести UX-ревью прототипа", status: "active", assignee: "Ира" },
                { title: "Настроить CI/CD пайплайн", status: "overdue", assignee: "Олег" },
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm flex-1">{t.title}</span>
                  <Badge variant={t.status === "done" ? "default" : t.status === "overdue" ? "destructive" : "secondary"} className="text-[10px]">
                    {t.status === "done" ? "✅" : t.status === "overdue" ? "🔴" : "🔵"} {t.assignee}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Variant 2: Structured Overview ───
function StructuredVariant() {
  return (
    <div className="h-[520px] border rounded-xl overflow-hidden bg-background">
      <ScrollArea className="h-full">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">🚀 Проект Alpha</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Управление проектами нового поколения</p>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">В графике</Badge>
              <Badge variant="outline">Q2 2026</Badge>
            </div>
          </div>

          {/* Dashboard embed */}
          <Card className="border-primary/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-5 gap-4">
                {[
                  { icon: TrendingUp, label: "Прогресс", value: "68%", sub: "24 из 35" },
                  { icon: Clock, label: "До дедлайна", value: "42 дня", sub: "15 мая" },
                  { icon: AlertTriangle, label: "Просрочено", value: "3", sub: "задачи" },
                  { icon: Users, label: "Команда", value: "8", sub: "участников" },
                  { icon: Target, label: "Вехи", value: "2/5", sub: "пройдено" },
                ].map(m => (
                  <div key={m.label} className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <m.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{m.value}</div>
                      <div className="text-[10px] text-muted-foreground">{m.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Progress value={68} className="h-1.5 mt-3" />
            </CardContent>
          </Card>

          {/* Structured sections */}
          <div className="grid grid-cols-2 gap-4">
            {/* Description */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Описание
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Разработка нового модуля управления проектами с ИИ-аналитикой. 
                Фокус на автоматизации рутинных процессов и повышении продуктивности команды.
              </CardContent>
            </Card>

            {/* Goals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" /> Цели
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {["Запуск MVP к Q2 2026", "3 интеграции", "Тесты >80%"].map((g, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${i === 0 ? "text-green-500" : "text-muted-foreground"}`} />
                    <span className={i === 0 ? "line-through text-muted-foreground" : ""}>{g}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Risks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Риски
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { text: "Нехватка ресурсов дизайна", severity: "high" },
                  { text: "Зависимость от внешнего API", severity: "medium" },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className={`h-2 w-2 rounded-full ${r.severity === "high" ? "bg-red-500" : "bg-yellow-500"}`} />
                    <span>{r.text}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Resources & Links */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4" /> Ресурсы
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Figma макеты", url: "#" },
                  { label: "ТЗ v2.1", url: "#" },
                  { label: "API документация", url: "#" },
                ].map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                    <ExternalLink className="h-3 w-3" />
                    <span>{l.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Related tasks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="h-4 w-4" /> Ключевые задачи
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {[
                  { title: "Подготовить ТЗ для дизайнера", status: "done", assignee: "Марк" },
                  { title: "Провести UX-ревью прототипа", status: "active", assignee: "Ира" },
                  { title: "Настроить CI/CD пайплайн", status: "overdue", assignee: "Олег" },
                ].map((t, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                    <CheckCircle2 className={`h-3.5 w-3.5 ${t.status === "done" ? "text-green-500" : t.status === "overdue" ? "text-red-500" : "text-blue-500"}`} />
                    <span className="text-sm flex-1">{t.title}</span>
                    <span className="text-xs text-muted-foreground">{t.assignee}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Variant 3: Notes Kanban ───
function NotesKanbanVariant() {
  const columns = [
    { title: "📌 Закреплено", color: "border-primary/30", notes: [
      { title: "Описание проекта", tags: ["обзор"], preview: "Разработка нового модуля управления проектами с ИИ-аналитикой..." },
      { title: "Контакты команды", tags: ["команда"], preview: "PM: Ирина К.\nDesign: Марк С.\nDev: Олег В." },
    ]},
    { title: "💡 Идеи", color: "border-yellow-500/30", notes: [
      { title: "Автоматическая генерация отчётов", tags: ["фича", "ИИ"], preview: "Еженедельный отчёт по прогрессу, формируется автоматически..." },
      { title: "Интеграция с Jira", tags: ["интеграция"], preview: "Двусторонняя синхронизация задач для enterprise-клиентов" },
    ]},
    { title: "📝 Заметки встреч", color: "border-green-500/30", notes: [
      { title: "Встреча 22.03 — Sprint Review", tags: ["встреча"], preview: "Обсудили прогресс модуля Gantt. Решение: добавить drag-n-drop..." },
      { title: "1-on-1 с Марком", tags: ["встреча", "дизайн"], preview: "Марк предложил редизайн карточек задач. Утвердили палитру..." },
    ]},
    { title: "📎 Ресурсы", color: "border-purple-500/30", notes: [
      { title: "Figma макеты v3", tags: ["дизайн"], preview: "figma.com/file/..." },
      { title: "Техническое задание", tags: ["документ"], preview: "Актуальная версия ТЗ 2.1, согласована 20.03" },
    ]},
  ];

  return (
    <div className="h-[520px] border rounded-xl overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Заметки проекта</span>
          <Badge variant="secondary" className="text-[10px]">12 заметок</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Заметка
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <ScrollArea className="h-[calc(100%-48px)]" orientation="horizontal">
        <div className="flex gap-3 p-4 h-full">
          {columns.map(col => (
            <div key={col.title} className={`w-64 shrink-0 rounded-lg border ${col.color} bg-muted/20 flex flex-col`}>
              <div className="px-3 py-2 font-medium text-sm flex items-center justify-between">
                <span>{col.title}</span>
                <span className="text-xs text-muted-foreground">{col.notes.length}</span>
              </div>
              <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto">
                {col.notes.map((note, i) => (
                  <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <h4 className="text-sm font-medium mb-1">{note.title}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{note.preview}</p>
                      <div className="flex gap-1 flex-wrap">
                        {note.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">{tag}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground">
                  <Plus className="h-3 w-3 mr-1" /> Добавить
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main Demo Page ───
export default function WikiDemo() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Wiki / Knowledge Base — Сравнение подходов</h1>
            <p className="text-sm text-muted-foreground">Переключай вкладки чтобы сравнить три концепции</p>
          </div>
        </div>

        <Tabs defaultValue="wiki" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="wiki" className="gap-2">
              <BookOpen className="h-4 w-4" /> Wiki-страницы
            </TabsTrigger>
            <TabsTrigger value="structured" className="gap-2">
              <LayoutGrid className="h-4 w-4" /> Structured
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <StickyNote className="h-4 w-4" /> Канбан заметок
            </TabsTrigger>
          </TabsList>

          <TabsContent value="wiki">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Notion-стиль Wiki</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Вложенные страницы с Markdown-редактором. Максимальная гибкость — пишешь что угодно. 
                Встроенные дашборды и ссылки на задачи прямо в тексте.
              </p>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-green-500/10 text-green-600">+ Гибкость</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Вложенность</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Embed виджетов</Badge>
                <Badge className="bg-red-500/10 text-red-600">− Нужен редактор</Badge>
                <Badge className="bg-red-500/10 text-red-600">− Сложнее реализация</Badge>
              </div>
            </div>
            <WikiPagesVariant />
          </TabsContent>

          <TabsContent value="structured">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <LayoutGrid className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Structured Overview</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Фиксированные секции: Описание, Цели, Риски, Ресурсы. Быстрое заполнение без редактора.
                Дашборд встроен в шапку. Подходит как вкладка в детальной панели проекта.
              </p>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-green-500/10 text-green-600">+ Быстрый старт</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Единообразие</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Просто реализовать</Badge>
                <Badge className="bg-red-500/10 text-red-600">− Ограниченная гибкость</Badge>
              </div>
            </div>
            <StructuredVariant />
          </TabsContent>

          <TabsContent value="notes">
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <StickyNote className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Канбан заметок</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Карточки-заметки с тегами и поиском. Группировка по колонкам. 
                Проще wiki, но гибче structured. Хорошо для brainstorm и быстрых записей.
              </p>
              <div className="flex gap-2 mt-2">
                <Badge className="bg-green-500/10 text-green-600">+ Визуально понятно</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Быстрые заметки</Badge>
                <Badge className="bg-green-500/10 text-green-600">+ Drag & drop</Badge>
                <Badge className="bg-red-500/10 text-red-600">− Нет вложенности</Badge>
                <Badge className="bg-red-500/10 text-red-600">− Не для длинных текстов</Badge>
              </div>
            </div>
            <NotesKanbanVariant />
          </TabsContent>
        </Tabs>

        {/* Recommendation */}
        <Card className="mt-6 border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">💡 Рекомендация</h3>
                <p className="text-sm text-muted-foreground">
                  <strong>Гибридный подход:</strong> начать со <strong>Structured Overview</strong> как вкладки в панели проекта 
                  (быстро реализовать, сразу полезно), затем добавить возможность создавать 
                  <strong> Wiki-страницы</strong> для проектов, которым нужна подробная документация. 
                  Канбан заметок можно добавить как отдельный режим внутри Wiki.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
