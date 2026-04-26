import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Search, Sparkles, MessageSquare, Lock } from "lucide-react";
import { ConsultantGuard } from "@/components/consultant/ConsultantGuard";
import { useAuth } from "@/hooks/useAuth";
import {
  AREA_LABELS,
  CONSULTANT_BLOCKED_ROUTES,
  CONSULTANT_VISIBLE_NAV_IDS,
  type ConsultantRestrictedArea,
} from "@/lib/consultantRestrictions";

/**
 * Dev-страница: реестр всех ограничений роли consultant.
 *
 * Показывает по каждой области из `ConsultantRestrictedArea`:
 *  - текущий режим (hide / faded);
 *  - где применяется (компонент/роут);
 *  - живой пример с `<ConsultantGuard>` — позволяет визуально проверить,
 *    как поведение выглядит для consultant и обычного пользователя.
 *
 * Доступ: только в dev (route `/dev/consultant-areas`). В проде роут не нужен,
 * но не блокируется специально — это безопасно, т.к. сама страница ничего
 * не раскрывает (использует уже существующие guard-правила).
 */

type AreaMeta = {
  mode: "hide" | "faded";
  scope: "global-ui" | "module" | "route" | "feature";
  appliedAt: string[];
  example: "button" | "section" | "route" | "nav";
};

const AREA_META: Record<ConsultantRestrictedArea, AreaMeta> = {
  search: {
    mode: "faded",
    scope: "global-ui",
    appliedAt: ["AppHeader.tsx", "ModuleLayout.tsx (Cmd+K)"],
    example: "button",
  },
  "ai-assistant": {
    mode: "faded",
    scope: "global-ui",
    appliedAt: ["AppHeader.tsx", "Index.tsx (panel)"],
    example: "button",
  },
  messenger: {
    mode: "faded",
    scope: "global-ui",
    appliedAt: ["AppHeader.tsx", "Index.tsx (MessengerPanel)"],
    example: "button",
  },
  "project-chat": {
    mode: "hide",
    scope: "feature",
    appliedAt: ["Index.tsx (ProjectChat)"],
    example: "section",
  },
  delegation: {
    mode: "faded",
    scope: "feature",
    appliedAt: ["AssigneePicker.tsx (tabs)", "Settings.tsx"],
    example: "section",
  },
  "tags-management": {
    mode: "hide",
    scope: "feature",
    appliedAt: ["Settings.tsx"],
    example: "section",
  },
  "import-export": {
    mode: "hide",
    scope: "feature",
    appliedAt: ["ProjectHeader / Smart Import-Export"],
    example: "button",
  },
  teams: {
    mode: "hide",
    scope: "feature",
    appliedAt: ["Settings.tsx"],
    example: "section",
  },
  admin: {
    mode: "hide",
    scope: "feature",
    appliedAt: ["Settings.tsx (AdminApproval)"],
    example: "section",
  },
  "calendar-sync": {
    mode: "hide",
    scope: "feature",
    appliedAt: ["Settings.tsx"],
    example: "section",
  },
  pmo: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  npd: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  crm: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  stm: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  protocols: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  wiki: {
    mode: "hide",
    scope: "route",
    appliedAt: ["App.tsx (ConsultantBlocked)", "MainNav.tsx"],
    example: "route",
  },
  community: {
    mode: "hide",
    scope: "module",
    appliedAt: ["MainNav.tsx (CONSULTANT_VISIBLE_NAV_IDS)"],
    example: "nav",
  },
  subordinates: {
    mode: "hide",
    scope: "module",
    appliedAt: ["MainNav.tsx (CONSULTANT_VISIBLE_NAV_IDS)"],
    example: "nav",
  },
  department: {
    mode: "hide",
    scope: "module",
    appliedAt: ["MainNav.tsx", "App.tsx (/my-department)"],
    example: "nav",
  },
  dashboard: {
    mode: "hide",
    scope: "module",
    appliedAt: ["MainNav.tsx (CONSULTANT_VISIBLE_NAV_IDS)"],
    example: "nav",
  },
  archive: {
    mode: "hide",
    scope: "module",
    appliedAt: ["MainNav.tsx (CONSULTANT_VISIBLE_NAV_IDS)"],
    example: "nav",
  },
};

const SCOPE_LABEL: Record<AreaMeta["scope"], string> = {
  "global-ui": "Глобальный UI",
  module: "Раздел сайдбара",
  route: "Роут модуля",
  feature: "Фича",
};

function ExampleRender({ area, meta }: { area: ConsultantRestrictedArea; meta: AreaMeta }) {
  const sampleButton = (() => {
    if (area === "search") return <Button size="sm" variant="ghost"><Search className="h-4 w-4" /></Button>;
    if (area === "ai-assistant") return <Button size="sm" variant="ghost"><Sparkles className="h-4 w-4" /></Button>;
    if (area === "messenger") return <Button size="sm" variant="ghost"><MessageSquare className="h-4 w-4" /></Button>;
    return <Button size="sm" variant="outline">Действие</Button>;
  })();

  if (meta.example === "button") {
    return (
      <ConsultantGuard area={area} mode={meta.mode}>
        {sampleButton}
      </ConsultantGuard>
    );
  }
  if (meta.example === "section") {
    return (
      <ConsultantGuard
        area={area}
        mode={meta.mode}
        fallback={
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Скрыто для consultant
          </div>
        }
      >
        <div className="rounded-md border border-border/60 bg-card p-3 text-sm">
          Демо-секция «{AREA_LABELS[area]}»
        </div>
      </ConsultantGuard>
    );
  }
  if (meta.example === "route") {
    return (
      <div className="text-xs text-muted-foreground">
        Роут <code className="rounded bg-muted px-1 py-0.5">{`/${area === "stm" ? "npd/stm" : area}`}</code> →{" "}
        <code>App.tsx · ConsultantBlocked</code> → редирект на <code>/</code>
      </div>
    );
  }
  // nav
  return (
    <div className="text-xs text-muted-foreground">
      Скрывается фильтром в <code>MainNav.tsx</code> через{" "}
      <code>CONSULTANT_VISIBLE_NAV_IDS</code>.
    </div>
  );
}

export default function ConsultantAreasDemo() {
  const { isConsultant, user } = useAuth();
  const all = Object.keys(AREA_META) as ConsultantRestrictedArea[];
  const grouped = {
    "global-ui": all.filter((a) => AREA_META[a].scope === "global-ui"),
    feature: all.filter((a) => AREA_META[a].scope === "feature"),
    route: all.filter((a) => AREA_META[a].scope === "route"),
    module: all.filter((a) => AREA_META[a].scope === "module"),
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Назад</Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-2xl font-semibold">Consultant — реестр ограничений</h1>
        </div>

        <Card className="mb-6 border-border/60">
          <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Текущий пользователь:</span>
              <Badge variant={isConsultant ? "destructive" : "secondary"}>
                {isConsultant ? "consultant" : "сотрудник / admin"}
              </Badge>
              {user?.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="text-xs text-muted-foreground">
              Войдите под consultant-аккаунтом, чтобы увидеть, как ограничения применяются вживую.
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Заблокированные роуты</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 pt-0 text-xs">
              {CONSULTANT_BLOCKED_ROUTES.map((r) => (
                <code key={r} className="rounded bg-muted px-1.5 py-0.5">{r}</code>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Видимые пункты сайдбара</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5 pt-0 text-xs">
              {Array.from(CONSULTANT_VISIBLE_NAV_IDS).map((id) => (
                <code key={id} className="rounded bg-muted px-1.5 py-0.5">{id}</code>
              ))}
            </CardContent>
          </Card>
        </div>

        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((scope) => (
          <div key={scope} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">{SCOPE_LABEL[scope]}</h2>
            <div className="space-y-2">
              {grouped[scope].map((area) => {
                const meta = AREA_META[area];
                return (
                  <Card key={area} className="border-border/60">
                    <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_auto_minmax(220px,auto)] md:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{AREA_LABELS[area]}</span>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{area}</code>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {meta.appliedAt.join(" · ")}
                        </div>
                      </div>
                      <Badge
                        variant={meta.mode === "hide" ? "outline" : "secondary"}
                        className="justify-self-start md:justify-self-center"
                      >
                        {meta.mode === "hide" ? "hide" : "faded"}
                      </Badge>
                      <div className="md:justify-self-end">
                        <ExampleRender area={area} meta={meta} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        <Card className="border-border/60 bg-muted/30">
          <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
            <p>
              Источник правды: <code>src/lib/consultantRestrictions.ts</code>. Добавляя новую area,
              обновите <code>ConsultantRestrictedArea</code>, <code>AREA_LABELS</code> и эту страницу
              (<code>AREA_META</code>).
            </p>
            <p>
              Линтер: <code>bun run lint:consultant</code> (запретит <code>!isConsultant && (...)</code>{" "}
              в JSX).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}