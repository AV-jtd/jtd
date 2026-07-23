import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Anchor element to position the popover relative to. */
  anchor: React.ReactNode;
  /** Initial date — today for create flow, current deadline for shift flow. */
  initialDate?: Date | null;
  /** Title shown in the popover header. */
  title: string;
  /** Submit label — e.g. "Создать" or "Перенести". */
  submitLabel: string;
  /** Callback when the user picks a date. */
  onSubmit: (date: Date) => void;
  /** Optional — only for empty cells; lets the user mark stage as N/A. */
  onMarkNotApplicable?: () => void;
}

/**
 * Unified date picker for KM Brand Control stage cells.
 * Combines a quick "+N days" slider with a precise calendar so the user can
 * either tap a typical offset or pick an exact date — single popover, single
 * commit. Used both for creating a missing stage and for shifting an existing
 * deadline (with cascade applied by the caller).
 */
export default function KmStageDatePopover({
  open,
  onOpenChange,
  anchor,
  initialDate,
  title,
  submitLabel,
  onSubmit,
  onMarkNotApplicable,
}: Props) {
  const today = new Date();
  today.setHours(18, 0, 0, 0);

  // Slider value = days from today (1-60). For shift flow, derived from initialDate.
  const initialOffset = initialDate
    ? Math.max(1, Math.min(60, Math.round((initialDate.getTime() - today.getTime()) / 86400000)))
    : 7;
  const [offset, setOffset] = useState(initialOffset);
  const [date, setDate] = useState<Date>(initialDate ?? addDays(today, initialOffset));

  useEffect(() => {
    if (open) {
      const init = initialDate ?? addDays(today, 7);
      setDate(init);
      setOffset(
        Math.max(1, Math.min(60, Math.round((init.getTime() - today.getTime()) / 86400000))),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSliderChange = (v: number[]) => {
    const d = addDays(today, v[0]);
    setOffset(v[0]);
    setDate(d);
  };

  const handleCalendarChange = (d: Date | undefined) => {
    if (!d) return;
    d.setHours(18, 0, 0, 0);
    setDate(d);
    setOffset(Math.max(1, Math.round((d.getTime() - today.getTime()) / 86400000)));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{anchor}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="center">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {date.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" })}
          </div>
        </div>

        <div className="px-3 py-3 space-y-2 border-b border-border">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Через</span>
            <span className="font-semibold tabular-nums text-foreground">
              {offset} {pluralizeDays(offset)}
            </span>
          </div>
          <Slider
            min={1}
            max={60}
            step={1}
            value={[offset]}
            onValueChange={handleSliderChange}
            className="cursor-pointer"
          />
        </div>

        <Calendar
          mode="single"
          selected={date}
          onSelect={handleCalendarChange}
          initialFocus
          className={cn("p-2 pointer-events-auto")}
        />

        <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
          {onMarkNotApplicable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => {
                onMarkNotApplicable();
                onOpenChange(false);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Не применимо
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 text-xs ml-auto"
            onClick={() => {
              onSubmit(date);
              onOpenChange(false);
            }}
          >
            <CalendarIcon className="h-3 w-3 mr-1" />
            {submitLabel}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}
