import { cn } from "@/lib/utils";

interface ProjectIconLike {
  icon?: string | null;
  color?: string | null;
  logo_url?: string | null;
  name?: string;
  /** Resolved logo of a linked CRM client — takes priority over logo_url. */
  client_logo_url?: string | null;
}

interface Props {
  group: ProjectIconLike;
  /** Размер квадратика. По умолчанию sm (~16px). */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** fallback emoji, если icon === "list" или пуст */
  fallbackEmoji?: string;
  className?: string;
  /** Заменить иконку на инициал из имени, если icon == "list" */
  initialFallback?: boolean;
}

const SIZES = {
  xs: { box: "h-3 w-3", text: "text-[10px]", img: "h-3 w-3 rounded-sm" },
  sm: { box: "h-4 w-4", text: "text-xs", img: "h-4 w-4 rounded" },
  md: { box: "h-6 w-6", text: "text-sm", img: "h-6 w-6 rounded" },
  lg: { box: "h-10 w-10", text: "text-lg", img: "h-10 w-10 rounded-md" },
  xl: { box: "h-14 w-14", text: "text-3xl", img: "h-14 w-14 rounded-lg" },
};

/**
 * Унифицированная иконка проекта/группы.
 * Приоритет: logo_url (картинка) → emoji (group.icon) → инициал/цветной квадратик.
 * Используется в сайдбаре, шапках, карточках, списках.
 */
export default function ProjectIcon({
  group,
  size = "sm",
  fallbackEmoji,
  className,
  initialFallback = false,
}: Props) {
  const s = SIZES[size];

  // 1. Logo URL — высший приоритет (логотип клиента приоритетнее собственного)
  const logo = group.client_logo_url || group.logo_url;
  if (logo) {
    return (
      <img
        src={logo}
        alt={group.name ?? ""}
        className={cn(s.img, "object-contain bg-white ring-1 ring-border shrink-0", className)}
      />
    );
  }

  // 2. Emoji
  if (group.icon && group.icon !== "list") {
    return (
      <span className={cn("leading-none shrink-0", s.text, className)}>
        {group.icon}
      </span>
    );
  }

  // 3. Инициал (для карточек дашбордов/CRM)
  if (initialFallback && group.name) {
    return (
      <div
        className={cn(
          s.box,
          "flex items-center justify-center rounded text-white font-semibold shrink-0",
          s.text,
          className,
        )}
        style={{ backgroundColor: group.color || "hsl(var(--primary))" }}
      >
        {group.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  // 4. Цветной квадратик (sidebar default)
  if (fallbackEmoji) {
    return (
      <span className={cn("leading-none shrink-0", s.text, className)}>
        {fallbackEmoji}
      </span>
    );
  }

  return (
    <div
      className={cn(s.box, "rounded shrink-0", className)}
      style={{ backgroundColor: group.color || "#3b82f6" }}
    />
  );
}
