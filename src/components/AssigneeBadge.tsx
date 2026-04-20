import { Building2, HardHat } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useDepartments";
import { useContractors } from "@/hooks/useContractors";

interface Props {
  departmentId?: string | null;
  contractorId?: string | null;
  className?: string;
  size?: "xs" | "sm";
}

/**
 * Чип «Делегировано отделу/подрядчику».
 * Показывается рядом с обычным assignee-чипом (или вместо него, если assigned_to пуст).
 * Это ТОЛЬКО метка — никаких уведомлений не отправляется.
 */
export default function AssigneeBadge({ departmentId, contractorId, className, size = "xs" }: Props) {
  const { data: departments = [] } = useDepartments();
  const { data: contractors = [] } = useContractors();

  if (!departmentId && !contractorId) return null;

  const dept = departmentId ? departments.find(d => d.id === departmentId) : null;
  const contractor = contractorId ? contractors.find(c => c.id === contractorId) : null;

  const sizes = size === "sm"
    ? "text-xs px-2 py-0.5 gap-1.5"
    : "text-[10px] px-1.5 py-0.5 gap-1";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <>
      {dept && (
        <span
          className={cn("inline-flex items-center rounded font-medium bg-muted text-foreground", sizes, className)}
          title={`Отдел: ${dept.name}`}
        >
          <Building2 className={iconSize} style={{ color: dept.color ?? undefined }} />
          <span className="truncate max-w-[120px]">{dept.name}</span>
        </span>
      )}
      {contractor && (
        <span
          className={cn("inline-flex items-center rounded font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400", sizes, className)}
          title={`Подрядчик: ${contractor.name}${contractor.organization ? ` (${contractor.organization})` : ""}`}
        >
          <HardHat className={iconSize} />
          <span className="truncate max-w-[120px]">{contractor.name}</span>
        </span>
      )}
    </>
  );
}
