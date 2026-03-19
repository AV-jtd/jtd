import { useState, useRef } from "react";
import { addDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import UserPicker from "@/components/UserPicker";
import type { Profile } from "@/hooks/useTasks";
import { Plus, X, CalendarIcon, User, FolderPlus, ListPlus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

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

interface QuickCreateFormProps {
  /** Available users for assignee picker */
  users: Profile[];
  /** Called when user submits. Return promise — spinner shown until resolved. */
  onCreate: (params: {
    type: QuickCreateType;
    title: string;
    deadline?: Date;
    assigneeId?: string;
  }) => Promise<void>;
  /** Which create options to show. Defaults to task + subproject. */
  options?: QuickCreateOption[];
  /** If only one option, skip the type selection step */
  singleType?: QuickCreateType;
  /** Compact mode — just a small + icon */
  compact?: boolean;
  /** Align popover */
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

export default function QuickCreateForm({
  users,
  onCreate,
  options = DEFAULT_OPTIONS,
  singleType,
  compact = false,
  align = "start",
  side = "bottom",
}: QuickCreateFormProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [selectedType, setSelectedType] = useState<QuickCreateType>("task");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("choose");
    setSelectedType("task");
    setTitle("");
    setDeadline(undefined);
    setAssigneeId(undefined);
    setSaving(false);
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

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate({ type: selectedType, title: title.trim(), deadline, assigneeId });
      // Stay open for rapid creation — reset form
      setTitle("");
      setDeadline(undefined);
      setAssigneeId(undefined);
      setTimeout(() => inputRef.current?.focus(), 50);
    } finally {
      setSaving(false);
    }
  };

  const assignee = users.find(u => u.id === assigneeId);
  const selectedOption = options.find(o => o.type === selectedType);

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 transition-colors",
            compact
              ? "p-1 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
              : "rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-primary hover:border-primary/30 w-full justify-center mt-1"
          )}
          title="Создать"
        >
          <Plus className="h-3.5 w-3.5" />
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
            {/* Type badge */}
            <div className="flex items-center gap-1.5">
              {selectedOption && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {selectedOption.icon}
                  {selectedOption.label}
                </span>
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

            {/* Title */}
            <Input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedType === "subproject" ? "Название подпроекта..." : "Название задачи..."}
              className="h-8 text-xs"
              disabled={saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
                if (e.key === "Escape") handleOpen(false);
              }}
            />

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
                <PopoverContent className="w-auto p-0 z-[60]" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={(d) => { setDeadline(d || undefined); setCalOpen(false); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <UserPicker
                users={users}
                onSelect={(u) => setAssigneeId(u.id)}
                open={userPickerOpen}
                onOpenChange={setUserPickerOpen}
                title="Ответственный"
                trigger={
                  <button className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                    assigneeId ? "border-primary/30 text-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <User className="h-3 w-3" />
                    {assignee ? (assignee.display_name || "").split(" ")[0] : "Кто"}
                  </button>
                }
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                onClick={handleSubmit}
                disabled={saving || !title.trim()}
                className="flex-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {saving ? "Создаю..." : "Создать"}
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
