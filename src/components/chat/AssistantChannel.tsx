import AiChatThread from "@/components/AiChatThread";
import { Sparkles, ListChecks, ArrowLeft } from "lucide-react";

/**
 * Персональный канал «ИИ-ассистент» — ядро ЭФИРа (центр уведомлений + помощник).
 * Оборачивает кросс-проектный AiChatThread в шапку с фирменным заголовком.
 * На мобильных в шапке появляется переход к панели «Мои задачи»
 * (на десктопе дашборд живёт в правом сайдбаре, поэтому кнопка не нужна).
 */
export default function AssistantChannel({
  onShowTasks,
  onBack,
}: {
  onShowTasks?: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        {onBack && (
          <button
            onClick={onBack}
            className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted md:hidden"
            title="Назад к списку"
            aria-label="Назад к списку"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">ИИ-ассистент</p>
          <p className="truncate text-[11px] text-muted-foreground">Сводка задач, уведомления и помощь</p>
        </div>
        {onShowTasks && (
          <button
            onClick={onShowTasks}
            className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/70"
            title="Мои задачи"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Мои задачи
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <AiChatThread mode="assistant" />
      </div>
    </div>
  );
}
