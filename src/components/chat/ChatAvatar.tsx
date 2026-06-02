import { cn } from "@/lib/utils";
import { getInitials, getAvatarColors } from "@/lib/initials";

/**
 * Единый аватар-инициалы для всех чатов (задача / проект / мессенджер).
 * Цвет фона детерминирован по имени — одинаковые имена дают один цвет.
 */
export default function ChatAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        size === "xs" ? "h-4 w-4 text-[8px]" : "h-5 w-5 text-[9px]",
        className,
      )}
      style={getAvatarColors(name)}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}