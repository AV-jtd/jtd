import { type ReactNode, type ReactElement, cloneElement, isValidElement } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CONSULTANT_FADED_CLASS,
  consultantTooltip,
  type ConsultantRestrictedArea,
} from "@/lib/consultantRestrictions";

/**
 * Универсальный guard-обёртка вокруг любого UI-элемента, недоступного консультанту.
 *
 * Режимы:
 * - `mode="hide"` (по умолчанию) — элемент не рендерится для consultant.
 * - `mode="faded"` — элемент рендерится, но disabled, faded, с tooltip.
 *   Работает только для одиночного React-элемента (button/Link и т.п.) —
 *   к нему добавляются `disabled`, `aria-disabled`, faded-классы и tooltip.
 *
 * Если пользователь не consultant — children рендерятся как есть.
 *
 * Любая новая кнопка/раздел, ограниченная для внешних пользователей,
 * должна оборачиваться в этот компонент. Это гарантирует, что правила
 * автоматически применятся ко всем будущим категориям внешних ролей
 * (см. mem://constraints/external-users-default).
 */
interface ConsultantGuardProps {
  area: ConsultantRestrictedArea;
  children: ReactNode;
  mode?: "hide" | "faded";
  /** Доп. fallback для режима hide (например, упрощённый плейсхолдер). */
  fallback?: ReactNode;
  /** Кастомный текст tooltip (по умолчанию — из AREA_LABELS). */
  tooltipText?: string;
}

export function ConsultantGuard({
  area,
  children,
  mode = "hide",
  fallback = null,
  tooltipText,
}: ConsultantGuardProps) {
  const { isConsultant } = useAuth();
  if (!isConsultant) return <>{children}</>;

  if (mode === "hide") return <>{fallback}</>;

  // mode === "faded": ожидаем одиночный React-элемент
  if (!isValidElement(children)) return <>{fallback}</>;

  const child = children as ReactElement<{
    className?: string;
    disabled?: boolean;
    onClick?: unknown;
    "aria-disabled"?: boolean | "true" | "false";
    tabIndex?: number;
  }>;

  const fadedChild = cloneElement(child, {
    className: cn(child.props.className, CONSULTANT_FADED_CLASS),
    disabled: true,
    "aria-disabled": "true",
    tabIndex: -1,
    onClick: (e: Event) => e.preventDefault(),
  });

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Обёртка нужна, потому что disabled-элементы не триггерят hover. */}
          <span className="inline-flex">{fadedChild}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          {tooltipText ?? consultantTooltip(area)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Хелпер-хук: вернёт true, если текущий пользователь consultant.
 * Удобен для conditional-логики вне JSX (effects, handlers).
 */
export function useConsultantBlocked(_area?: ConsultantRestrictedArea): boolean {
  const { isConsultant } = useAuth();
  return isConsultant;
}