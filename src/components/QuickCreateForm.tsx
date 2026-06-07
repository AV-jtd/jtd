import { useState, useRef, useMemo } from "react";
import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import AssigneeBadge from "@/components/AssigneeBadge";
import type { Profile } from "@/hooks/useTasks";
import { Plus, X, CalendarIcon, User, FolderPlus, ListPlus, Loader2, PlayCircle, ListChecks, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseQuickTask } from "@/lib/quickTaskParse";

export type QuickCreateType = "task" | "subproject";

export interface QuickCreateOption {
  type: QuickCreateType;
  label: string;
  icon: React.ReactNode;
}

const DEFAULT_OPTIONS: QuickCreateOption[] = [
  { type: "task", label: "Задача", icon: <ListPlus className="h-3.5 w-3.5" /> },
  { type: "subproject", label: "Подпроект", icon: <FolderPlus className="h-3.5 w-3.5" /> },
];

export interface QuickCreateResult {
  type: QuickCreateType;
  title: string;
  deadline?: Date;
  assigneeId?: string;
  departmentId?: string;
  contractorId?: string;
  /** Suggested start date (template). User can override via dependencies later. */
  startFrom?: Date;
}

interface QuickCreateFormProps {
  /** Available users for assignee picker */
  users: Profile[];
  /** Called when user submits. Return promise — spinner shown until resolved. */
  onCreate: (params: QuickCreateResult) => Promise<void>;
  /** Which create options to show. Defaults to task + subproject. */
  options?: QuickCreateOption[];
  /** If only one option, skip the type selection step */
  singleType?: QuickCreateType;
  /** Compact mode — just a small + icon */
  compact?: boolean;
  /**
   * Optional visible label next to the "+" in the trigger (e.g. "Задача").
   * When set, the trigger renders as a labeled pill button instead of a bare icon.
   */
  triggerLabel?: string;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
  /** Align popover */
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  /**
   * Suggested start date for the task (template).
   * Days slider will count from this date instead of today.
   * Shown as a visual hint in the form.
   */
  startFrom?: Date;
  /** Label explaining where startFrom comes from, e.g. "после Gate 1" */
  startFromLabel?: string;
}

export default function QuickCreateForm({
  users,
  onCreate,
  options = DEFAULT_OPTIONS,
  singleType,
  compact = false,
  triggerLabel,
  triggerClassName,
  align = "start",
  side = "bottom",
  startFrom,
  startFromLabel,
}: QuickCreateFormProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [selectedType, setSelectedType] = useState<QuickCreateType>("task");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [daysInput, setDaysInput] = useState<number>(7);
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [contractorId, setContractorId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Base date for the days slider: startFrom (gate boundary) or today
  const baseDate = startFrom || new Date();

  const reset = () => {
    setStep("choose");
    setSelectedType("task");
    setTitle("");
    setDeadline(undefined);
    setAssigneeId(undefined);
    setDepartmentId(undefined);
    setContractorId(undefined);
    setSaving(false);
    setBatchMode(false);
    setBatchText("");
  };

  const handleOpen = (open: boolean) => {
    setPopoverOpen(open);
    if (!open) reset();
    if (open && singleType) {
      setSelectedType(singleType);
      setStep("form");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSelectType = (type: QuickCreateType) => {
    setSelectedType(type);
    setStep("form");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Live-парсинг title (одиночный режим)
  const parsed = useMemo(() => parseQuickTask(title, users), [title, users]);
  const hasInlineMeta = parsed.tokens.length > 0;
  const effectiveAssigneeId = parsed.assigneeId || assigneeId;
  const effectiveDeadline = parsed.deadline || deadline;

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const cleanTitle = parsed.cleanTitle || title.trim();
      await onCreate({
        type: selectedType,
        title: cleanTitle,
        deadline: effectiveDeadline,
        assigneeId: effectiveAssigneeId,
        departmentId,
        contractorId,
        startFrom,
      });
      // Stay open for rapid creation — reset form
      setTitle("");
      setDeadline(undefined);
      setAssigneeId(undefined);
      setDepartmentId(undefined);
      setContractorId(undefined);
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setSaving(false);
    }
  };

  const handleBatchSubmit = async () => {
    const lines = batchText
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0 || saving) return;
    setSaving(true);
    try {
      for (const line of lines) {
        // Парсим каждую строку отдельно — @имя/срок/! работают построчно
        const lineParsed = parseQuickTask(line, users);
        await onCreate({
          type: selectedType,
          title: lineParsed.cleanTitle || line,
          deadline: lineParsed.deadline || deadline,
          assigneeId: lineParsed.assigneeId || assigneeId,
          departmentId,
          contractorId,
          startFrom,
        });
      }
      setBatchText("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    } finally {
      setSaving(false);
    }
  };

  const batchLineCount = batchText.split("\n").filter(l => l.trim()).length;

  const assignee = users.find(u => u.id === assigneeId);
  const selectedOption = options.find(o => o.type === selectedType);

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 transition-colors",
            triggerLabel
              ? cn(
                  "rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10",
                  triggerClassName,
                )
              : compact
                ? "p-1 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
                : "rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 w-full justify-center mt-1"
          )}
          title={triggerLabel ? `Создать: ${triggerLabel}` : "Создать"}
        >
          <Plus className="h-3.5 w-3.5" />
          {triggerLabel && <span>{triggerLabel}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align={align}
        side={side}
        onClick={(e) => e.stopPropagation()}
      >
        {step === "choose" && !singleType && (
          <div className="p-1.5">
            <p className="text-[10px] font-medium text-muted-foreground px-2 py-1 mb-0.5 uppercase tracking-wider">
              Создать
            </p>
            {options.map((opt) => (
              <button
                key={opt.type}
                onClick={() => handleSelectType(opt.type)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
              >
                <span className="text-muted-foreground">{opt.icon}</span>
                <span className="font-medium text-foreground">{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {step === "form" && (
          <div className="p-2.5 space-y-2">
            {/* Type badge + batch toggle */}
            <div className="flex items-center gap-1.5">
              {selectedOption && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {selectedOption.icon}
                  {selectedOption.label}
                </span>
              )}
              {selectedType === "task" && (
                <button
                  onClick={() => {
                    setBatchMode(!batchMode);
                    if (!batchMode) {
                      setTimeout(() => textareaRef.current?.focus(), 100);
                    } else {
                      setTimeout(() => inputRef.current?.focus(), 100);
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded transition-colors",
                    batchMode
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                  )}
                  title="Массовое добавление — каждая строка = задача"
                >
                  <ListChecks className="h-3 w-3" />
                  {batchMode ? "Пакет" : ""}
                </button>
              )}
              {!singleType && (
                <button
                  onClick={() => setStep("choose")}
                  className="text-[10px] text-muted-foreground/60 hover:text-foreground ml-auto"
                >
                  ← назад
                </button>
              )}
            </div>

            {/* Start-from hint */}
            {startFrom && selectedType === "task" && (
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-accent/50 border border-accent">
                <PlayCircle className="h-3 w-3 text-primary shrink-0" />
                <span className="text-[10px] text-foreground">
                  Старт: <strong>{format(startFrom, "d MMM", { locale: ru })}</strong>
                </span>
                {startFromLabel && (
                  <span className="text-[9px] text-muted-foreground ml-auto truncate">
                    {startFromLabel}
                  </span>
                )}
              </div>
            )}

            {/* Single mode: title input */}
            {!batchMode && (
              <>
                <Input
                  ref={inputRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selectedType === "subproject" ? "Название подпроекта..." : "Название задачи... (@имя, до 25.04, !)"}
                  className="h-8 text-xs"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                    if (e.key === "Escape") handleOpen(false);
                  }}
                />
                {hasInlineMeta && selectedType === "task" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Sparkles className="h-2.5 w-2.5 text-primary/60 shrink-0" />
                    {parsed.tokens.map((tok, i) => (
                      <span
                        key={i}
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium",
                          tok.kind === "assignee" && "bg-primary/10 text-primary",
                          tok.kind === "deadline" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          tok.kind === "important" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          tok.kind === "tag" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {tok.label}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Batch mode: textarea */}
            {batchMode && (
              <div className="space-y-1">
                <Textarea
                  ref={textareaRef}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder={"Каждая строка — новая задача:\nРазработка прототипа\nТестирование образцов\nСогласование спецификации"}
                  className="text-xs min-h-[80px] max-h-[200px] resize-y"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") handleOpen(false);
                  }}
                />
                {batchLineCount > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 px-0.5">
                    {batchLineCount} {batchLineCount === 1 ? "задача" : batchLineCount < 5 ? "задачи" : "задач"}
                  </p>
                )}
              </div>
            )}

            {/* Deadline + Assignee row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                    deadline ? "border-primary/30 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <CalendarIcon className="h-3 w-3" />
                    {deadline ? format(deadline, "d MMM", { locale: ru }) : "Срок"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 z-[60]" align="start">
                  <div className="p-3 space-y-2.5">
                    {startFrom && (
                      <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <PlayCircle className="h-2.5 w-2.5" />
                        от {format(baseDate, "d MMM", { locale: ru })}
                        {startFromLabel && <span>({startFromLabel})</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {startFrom ? "+" : "Через"}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={daysInput}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(365, Number(e.target.value) || 1));
                          setDaysInput(v);
                        }}
                        className="w-12 h-6 text-xs text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                      <span className="text-[10px] text-muted-foreground">дн.</span>
                      <button
                        type="button"
                        onClick={() => { setDeadline(addDays(baseDate, daysInput)); setCalOpen(false); }}
                        className="ml-auto text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        ОК
                      </button>
                    </div>
                    <Slider
                      min={1}
                      max={90}
                      step={1}
                      value={[Math.min(daysInput, 90)]}
                      onValueChange={([v]) => setDaysInput(v)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground/60">
                      <span>1д</span><span>30д</span><span>90д</span>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={(d) => { setDeadline(d || undefined); setCalOpen(false); }}
                    initialFocus
                    className={cn("p-3 pt-0 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <AssigneePicker
                users={users}
                current={
                  assigneeId
                    ? { kind: "user", id: assigneeId }
                    : departmentId
                      ? { kind: "department", id: departmentId }
                      : contractorId
                        ? { kind: "contractor", id: contractorId }
                        : undefined
                }
                onSelect={(sel: AssigneeSelection) => {
                  if (sel.kind === "user") {
                    setAssigneeId(sel.id || undefined);
                    setDepartmentId(undefined);
                    setContractorId(undefined);
                  } else if (sel.kind === "department") {
                    setDepartmentId(sel.id || undefined);
                    setAssigneeId(undefined);
                    setContractorId(undefined);
                  } else if (sel.kind === "contractor") {
                    setContractorId(sel.id || undefined);
                    setAssigneeId(undefined);
                    setDepartmentId(undefined);
                  } else {
                    setAssigneeId(undefined);
                    setDepartmentId(undefined);
                    setContractorId(undefined);
                  }
                }}
                open={userPickerOpen}
                onOpenChange={setUserPickerOpen}
                trigger={
                  <button className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                    (assigneeId || departmentId || contractorId)
                      ? "border-primary/30 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    {assignee ? (
                      <>
                        <User className="h-3 w-3" />
                        {(assignee.display_name || "").split(" ")[0]}
                      </>
                    ) : (departmentId || contractorId) ? (
                      <AssigneeBadge departmentId={departmentId} contractorId={contractorId} />
                    ) : (
                      <>
                        <User className="h-3 w-3" />
                        Кто
                      </>
                    )}
                  </button>
                }
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                onClick={batchMode ? handleBatchSubmit : handleSubmit}
                disabled={saving || (batchMode ? batchLineCount === 0 : !title.trim())}
                className="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {saving ? "Создаю..." : batchMode ? `Создать ${batchLineCount > 0 ? batchLineCount : ""}` : "Создать"}
              </button>
              <button
                onClick={() => handleOpen(false)}
                className="px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
