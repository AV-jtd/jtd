import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, FileText, Type, Sparkles, BookOpen } from "lucide-react";
import SmartImportDialog from "@/components/SmartImportDialog";
import ProtocolImportDialog from "./ProtocolImportDialog";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Source = "excel" | "pdf-text" | "living" | null;

export default function UnifiedImportDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>(null);

  // Сброс источника при закрытии
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setSource(null), 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSourceClose = (v: boolean) => {
    if (!v) {
      onOpenChange(false);
    }
  };

  // Excel flow — контролируемый SmartImportDialog (всегда черновик для протоколов)
  if (open && source === "excel") {
    return (
      <SmartImportDialog
        open={true}
        onOpenChange={handleSourceClose}
        asDraft={true}
        projectType="protocol"
        onSuccess={(groupId) => {
          onOpenChange(false);
          navigate(`/protocols/${groupId}`);
        }}
      />
    );
  }

  // PDF / Текст flow
  if (open && source === "pdf-text") {
    return (
      <ProtocolImportDialog
        open={true}
        onOpenChange={handleSourceClose}
      />
    );
  }

  // Living flow — тот же диалог, но с фиксированным шаблоном
  if (open && source === "living") {
    return (
      <ProtocolImportDialog
        open={true}
        onOpenChange={handleSourceClose}
        forcedTemplateKey="living"
      />
    );
  }

  // Главный экран — выбор источника
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Импорт протокола
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Выберите источник — ИИ автоматически распознает структуру, ответственных и сроки.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SourceCard
            icon={<FileSpreadsheet className="h-7 w-7" />}
            title="Excel"
            description="Готовая таблица с задачами"
            badge=".xlsx"
            tone="emerald"
            onClick={() => setSource("excel")}
          />
          <SourceCard
            icon={<FileText className="h-7 w-7" />}
            title="PDF / Текст"
            description="Формальный протокол с блоками и таблицами"
            badge=".pdf / paste"
            tone="rose"
            onClick={() => setSource("pdf-text")}
          />
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-background px-2 text-[10px] uppercase text-muted-foreground">или</span></div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <SourceCard
            icon={<BookOpen className="h-7 w-7" />}
            title="📖 Живой документ"
            description="Свободные заметки встречи — ИИ сгруппирует по темам с тезисами-выводами"
            badge="living"
            tone="indigo"
            onClick={() => setSource("living")}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Что произойдёт дальше
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            <li>· ИИ извлекает задачи, ответственных и сроки</li>
            <li>· Подбирает шаблон протокола (R7 / R&amp;D / Стратегия…)</li>
            <li>· Связывает с командой и системными тегами (Площадка, Бренд, Клиент)</li>
            <li>· Создаёт проект-протокол со всеми задачами одной кнопкой</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({
  icon, title, description, badge, tone, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  tone: "emerald" | "rose" | "indigo";
  onClick: () => void;
}) {
  const toneMap = {
    emerald: {
      gradient: "from-emerald-500/10 to-emerald-500/[0.03]",
      text: "text-emerald-600 dark:text-emerald-400",
      hover: "hover:border-emerald-500/40",
    },
    rose: {
      gradient: "from-rose-500/10 to-rose-500/[0.03]",
      text: "text-rose-600 dark:text-rose-400",
      hover: "hover:border-rose-500/40",
    },
    indigo: {
      gradient: "from-indigo-500/10 to-indigo-500/[0.03]",
      text: "text-indigo-600 dark:text-indigo-400",
      hover: "hover:border-indigo-500/40",
    },
  };
  const t = toneMap[tone];
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-xl border border-border bg-gradient-to-br ${t.gradient} p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${t.hover}`}
    >
      <div className="flex items-start justify-between">
        <div className={t.text}>{icon}</div>
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {badge}
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{description}</p>
      </div>
    </button>
  );
}
