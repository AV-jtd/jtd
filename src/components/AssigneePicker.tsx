import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, HardHat, User as UserIcon, X } from "lucide-react";
import type { Profile } from "@/hooks/useTasks";
import { useDepartments } from "@/hooks/useDepartments";
import { useContractors } from "@/hooks/useContractors";

export type AssigneeKind = "user" | "department" | "contractor" | null;

export interface AssigneeSelection {
  kind: AssigneeKind;
  id: string | null;
}

interface Props {
  users: Profile[];
  /** Текущее состояние (для подсветки активного варианта). */
  current?: AssigneeSelection;
  /** Возвращает выбранную сущность ИЛИ null (снять). */
  onSelect: (sel: AssigneeSelection) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
  /** Скрыть вкладку «Подрядчик» (например, для подзадач или внутренних задач). */
  hideContractor?: boolean;
  /** Скрыть вкладку «Отдел». */
  hideDepartment?: boolean;
  /** Поддержать «Снять исполнителя». */
  allowClear?: boolean;
  excludeUserIds?: string[];
}

/**
 * Унифицированный пикер исполнителя: Сотрудник / Отдел / Подрядчик.
 * Подрядчик и отдел — метки без уведомлений (просто визуальная пометка кому делегировано).
 */
export default function AssigneePicker({
  users,
  current,
  onSelect,
  open,
  onOpenChange,
  trigger,
  side = "left",
  hideContractor = false,
  hideDepartment = false,
  allowClear = true,
  excludeUserIds = [],
}: Props) {
  const [tab, setTab] = useState<"user" | "department" | "contractor">(
    current?.kind === "department" ? "department" :
    current?.kind === "contractor" ? "contractor" :
    "user"
  );
  const [search, setSearch] = useState("");

  const { data: departments = [] } = useDepartments();
  const { data: contractors = [] } = useContractors();

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (excludeUserIds.includes(u.id)) return false;
      if (!q) return true;
      return (u.display_name ?? "").toLowerCase().includes(q);
    });
  }, [users, search, excludeUserIds]);

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(d => d.name.toLowerCase().includes(q));
  }, [departments, search]);

  const filteredContractors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q)
    );
  }, [contractors, search]);

  const close = () => {
    onOpenChange(false);
    setSearch("");
  };

  const tabsCount = (hideDepartment ? 0 : 1) + (hideContractor ? 0 : 1) + 1;

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" side={side} align="start">
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          {tabsCount > 1 && (
            <TabsList className="grid w-full mb-2" style={{ gridTemplateColumns: `repeat(${tabsCount}, minmax(0, 1fr))` }}>
              <TabsTrigger value="user" className="text-xs gap-1">
                <UserIcon className="h-3 w-3" />Сотрудник
              </TabsTrigger>
              {!hideDepartment && (
                <TabsTrigger value="department" className="text-xs gap-1">
                  <Building2 className="h-3 w-3" />Отдел
                </TabsTrigger>
              )}
              {!hideContractor && (
                <TabsTrigger value="contractor" className="text-xs gap-1">
                  <HardHat className="h-3 w-3" />Подрядчик
                </TabsTrigger>
              )}
            </TabsList>
          )}

          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="h-7 text-xs mb-2"
          />

          <TabsContent value="user" className="m-0">
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {filteredUsers.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-2 text-center">Не найдено</p>
              )}
              {filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => { onSelect({ kind: "user", id: u.id }); close(); }}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors ${current?.kind === "user" && current.id === u.id ? "bg-muted" : ""}`}
                >
                  <UserIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{u.display_name || "Без имени"}</span>
                </button>
              ))}
            </div>
          </TabsContent>

          {!hideDepartment && (
            <TabsContent value="department" className="m-0">
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {filteredDepartments.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2 text-center">
                    Нет отделов. Создайте в Настройках.
                  </p>
                )}
                {filteredDepartments.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { onSelect({ kind: "department", id: d.id }); close(); }}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors ${current?.kind === "department" && current.id === d.id ? "bg-muted" : ""}`}
                  >
                    <Building2 className="h-3 w-3 shrink-0" style={{ color: d.color ?? undefined }} />
                    <span className="text-sm truncate">{d.name}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
          )}

          {!hideContractor && (
            <TabsContent value="contractor" className="m-0">
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {filteredContractors.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-2 text-center">
                    Нет подрядчиков. Создайте в Настройках.
                  </p>
                )}
                {filteredContractors.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onSelect({ kind: "contractor", id: c.id }); close(); }}
                    className={`flex items-start gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors ${current?.kind === "contractor" && current.id === c.id ? "bg-muted" : ""}`}
                  >
                    <HardHat className="h-3 w-3 mt-0.5 shrink-0" style={{ color: c.color ?? undefined }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{c.name}</div>
                      {c.organization && (
                        <div className="text-[10px] text-muted-foreground truncate">{c.organization}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {allowClear && current && current.id && (
          <button
            onClick={() => { onSelect({ kind: null, id: null }); close(); }}
            className="flex items-center gap-1.5 w-full mt-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted transition-colors border-t"
          >
            <X className="h-3 w-3" />Снять исполнителя
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
