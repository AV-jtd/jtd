import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, HardHat, User as UserIcon, X, Search } from "lucide-react";
import type { Profile } from "@/hooks/useTasks";
import { useDepartments } from "@/hooks/useDepartments";
import { useContractors } from "@/hooks/useContractors";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CONSULTANT_FADED_CLASS, consultantTooltip } from "@/lib/consultantRestrictions";

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
  const { isConsultant } = useAuth();
  // Консультанту вкладки видны, но faded+disabled (если родитель не скрыл явно).
  const effHideDepartment = hideDepartment;
  const effHideContractor = hideContractor;
  const deptDisabled = isConsultant;
  const contrDisabled = isConsultant;
  const [tab, setTab] = useState<"user" | "department" | "contractor">(
    current?.kind === "department" && !deptDisabled ? "department" :
    current?.kind === "contractor" && !contrDisabled ? "contractor" :
    "user"
  );
  const [search, setSearch] = useState("");

  // Не дёргаем эндпоинты для consultant — RLS вернёт пустоту, лишний запрос ни к чему.
  const departmentsQuery = useDepartments();
  const contractorsQuery = useContractors();
  const departments = isConsultant ? [] : (departmentsQuery.data ?? []);
  const contractors = isConsultant ? [] : (contractorsQuery.data ?? []);

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
    return departments.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q)
    );
  }, [departments, search]);

  const filteredContractors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contractors;
    return contractors.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q) ||
      (c.contact_name ?? "").toLowerCase().includes(q)
    );
  }, [contractors, search]);

  // Счётчики совпадений по вкладкам — для бейджей и автопереключения
  const counts = useMemo(() => ({
    user: filteredUsers.length,
    department: effHideDepartment ? 0 : filteredDepartments.length,
    contractor: effHideContractor ? 0 : filteredContractors.length,
  }), [filteredUsers.length, filteredDepartments.length, filteredContractors.length, effHideDepartment, effHideContractor]);

  // Подсветка совпадения в строке
  const highlight = (text: string) => {
    const q = search.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  // Автопереключение на вкладку, где есть результаты, если на текущей пусто
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (!value.trim()) return;
    const q = value.toLowerCase();
    const inUser = users.some(u => !excludeUserIds.includes(u.id) && (u.display_name ?? "").toLowerCase().includes(q));
    const inDept = !effHideDepartment && departments.some(d =>
      d.name.toLowerCase().includes(q) || (d.description ?? "").toLowerCase().includes(q)
    );
    const inContr = !effHideContractor && contractors.some(c =>
      c.name.toLowerCase().includes(q) ||
      (c.organization ?? "").toLowerCase().includes(q) ||
      (c.contact_name ?? "").toLowerCase().includes(q)
    );
    const currentHas =
      (tab === "user" && inUser) ||
      (tab === "department" && inDept) ||
      (tab === "contractor" && inContr);
    if (currentHas) return;
    if (inUser) setTab("user");
    else if (inDept) setTab("department");
    else if (inContr) setTab("contractor");
  };

  const close = () => {
    onOpenChange(false);
    setSearch("");
  };

  const tabsCount = (effHideDepartment ? 0 : 1) + (effHideContractor ? 0 : 1) + 1;

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-2" side={side} align="start">
        <Tabs
          value={tab}
          onValueChange={(v: any) => {
            if (deptDisabled && v === "department") return;
            if (contrDisabled && v === "contractor") return;
            setTab(v);
          }}
        >
          {tabsCount > 1 && (
            <TabsList className="grid w-full mb-2" style={{ gridTemplateColumns: `repeat(${tabsCount}, minmax(0, 1fr))` }}>
              <TabsTrigger value="user" className="text-xs gap-1">
                <UserIcon className="h-3 w-3" />Сотрудник
                {search.trim() && counts.user > 0 && (
                  <span className="ml-0.5 text-[10px] bg-primary/15 text-primary rounded px-1">{counts.user}</span>
                )}
              </TabsTrigger>
              {!effHideDepartment && (
                deptDisabled ? (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value="department"
                          disabled
                          className={`text-xs gap-1 ${CONSULTANT_FADED_CLASS} data-[state=active]:bg-transparent`}
                        >
                          <Building2 className="h-3 w-3" />Отдел
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        {consultantTooltip("delegation")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TabsTrigger value="department" className="text-xs gap-1">
                    <Building2 className="h-3 w-3" />Отдел
                    {search.trim() && counts.department > 0 && (
                      <span className="ml-0.5 text-[10px] bg-primary/15 text-primary rounded px-1">{counts.department}</span>
                    )}
                  </TabsTrigger>
                )
              )}
              {!effHideContractor && (
                contrDisabled ? (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value="contractor"
                          disabled
                          className={`text-xs gap-1 ${CONSULTANT_FADED_CLASS} data-[state=active]:bg-transparent`}
                        >
                          <HardHat className="h-3 w-3" />Подрядчик
                        </TabsTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-xs">
                        {consultantTooltip("delegation")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <TabsTrigger value="contractor" className="text-xs gap-1">
                    <HardHat className="h-3 w-3" />Подрядчик
                    {search.trim() && counts.contractor > 0 && (
                      <span className="ml-0.5 text-[10px] bg-primary/15 text-primary rounded px-1">{counts.contractor}</span>
                    )}
                  </TabsTrigger>
                )
              )}
            </TabsList>
          )}

          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Поиск по всем категориям..."
              className="h-7 text-xs pl-7"
            />
          </div>

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
                  <span className="text-sm truncate">{highlight(u.display_name || "Без имени")}</span>
                </button>
              ))}
            </div>
          </TabsContent>

          {!effHideDepartment && (
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
                    className={`flex items-start gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors ${current?.kind === "department" && current.id === d.id ? "bg-muted" : ""}`}
                  >
                    <Building2 className="h-3 w-3 mt-0.5 shrink-0" style={{ color: d.color ?? undefined }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{highlight(d.name)}</div>
                      {d.description && (
                        <div className="text-[10px] text-muted-foreground truncate">{highlight(d.description)}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          )}

          {!effHideContractor && (
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
                      <div className="text-sm truncate">{highlight(c.name)}</div>
                      {(c.organization || c.contact_name) && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {c.organization && highlight(c.organization)}
                          {c.organization && c.contact_name && " · "}
                          {c.contact_name && highlight(c.contact_name)}
                        </div>
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
