import { FileText, FileType2, ExternalLink, Download } from "lucide-react";

interface SourceFile {
  url: string;
  name?: string;
  mime?: string;
  size?: number;
  kind?: "pdf" | "text" | string;
}

interface Props {
  source?: SourceFile | null;
  className?: string;
}

/**
 * Небольшой бейдж со ссылкой на исходный файл протокола (PDF или .txt),
 * сохранённый при импорте в protocol_meta.source_file.
 * Показывается в шапке протокола (и formal, и living).
 */
export default function ProtocolSourceLink({ source, className }: Props) {
  if (!source?.url) return null;
  const isPdf = source.kind === "pdf" || source.mime === "application/pdf";
  const Icon = isPdf ? FileType2 : FileText;
  const label = source.name || (isPdf ? "Оригинал PDF" : "Оригинал");
  const sizeKb = source.size ? ` · ${(source.size / 1024).toFixed(0)} КБ` : "";
  return (
    <span className={"inline-flex items-center gap-1 " + (className || "")}>
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
      title={`Открыть исходник${sizeKb}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[200px] truncate">{label}</span>
      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
    </a>
    <a
      href={source.url}
      download={source.name || "protocol-source"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted hover:text-foreground"
      title={`Скачать исходник${sizeKb}`}
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden sm:inline">Скачать</span>
    </a>
    </span>
  );
}