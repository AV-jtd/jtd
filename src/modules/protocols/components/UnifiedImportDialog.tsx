import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, FileText, Type, Sparkles } from "lucide-react";
import SmartImportDialog from "@/components/SmartImportDialog";
import ProtocolImportDialog from "./ProtocolImportDialog";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Source = "excel" | "pdf-text" | null;

export default function UnifiedImportDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [source, setSource] = useState<Source>(null);

  const handleClose = (v: boolean) => {
    if (!v) {
      setTimeout(() => setSource(null), 200);
    }
    onOpenChange(v);
  };

  // Если выбран Excel — рендерим SmartImportDialog в открытом состоянии
  if (source === "excel") {
    return (
      <SmartImportDialog
        key="excel-flow"
        trigger={<span style={{ display: "none" }} />}
        onSuccess={(groupId) => {
          handleClose(false);
          navigate(`/protocols/${groupId}`);
        }}
      />
    );
  }

  // Если выбран PDF/текст — рендерим ProtocolImportDialog
  if (source === "pdf-text") {
    return (
      <ProtocolImportDialog
        open={open}
        onOpenChange={handleClose}
      />
    );
  }

  // Главный экран: выбор источника
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Импорт протокола — ИИ-ассистент
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Выберите источник — ИИ автоматически распознает структуру, ответственных и сроки.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SourceCard
            icon={<FileSpreadsheet className="h-7 w-7" />}
            title="Excel"
            description="Готовая таблица с колонками: задача, дедлайн, ответственный…"
            badge=".xlsx · .xls"
            color="emerald"
            onClick={() => setSource("excel")}
          />
          <SourceCard
            icon={<FileText className="h-7 w-7" />}
            title="PDF"
            description="Сканированный или экспортированный документ протокола"
            badge=".pdf"
            color="rose"
            onClick={() => setSource("pdf-text")}
          />
          <SourceCard
            icon={<Type className="h-7 w-7" />}
            title="Текст"
            description="Скопированный текст из Word, Notes, чата или письма"
            badge="paste"
            color="indigo"
            onClick={() => setSource("pdf-text")}
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Что произойдёт дальше
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            <li>· ИИ извлекает задачи, ответственных и сроки</li>
            <li>· Автоматически подбирает шаблон протокола (R7/R&D/Стратегия…)</li>
            <li>· Связывает с командой и системными тегами (Площадка, Бренд, Клиент)</li>
            <li>· Создаёт проект-протокол со всеми задачами одной кнопкой</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({
  icon, title, description, badge, color, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  color: "emerald" | "rose" | "indigo";
  onClick: () => void;
}) {
  const colorMap = {
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 group-hover:border-emerald-500/40",
    rose: "from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400 group-hover:border-rose-500/40",
    indigo: "from-indigo-500/10 to-indigo-500/5 text-indigo-600 dark:text-indigo-400 group-hover:border-indigo-500/40",
  };
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col gap-2 rounded-xl border border-border bg-gradient-to-br ${colorMap[color]} p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between">
        <div className={colorMap[color].split(" ").find(c => c.startsWith("text-"))}>{icon}</div>
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
