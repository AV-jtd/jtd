import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

interface ClientLike {
  name: string;
  logo_url?: string | null;
}

interface Props {
  client: ClientLike | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-10 w-10 text-sm",
};

/**
 * Аватар клиента CRM. Если есть logo_url — показываем его,
 * иначе — иконка Building2 на нейтральном фоне.
 */
export default function ClientAvatar({ client, size = "sm", className }: Props) {
  const s = SIZES[size];
  if (!client) {
    return (
      <div className={cn(s, "rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0", className)}>
        <Building2 className="h-2.5 w-2.5" />
      </div>
    );
  }
  if (client.logo_url) {
    return (
      <img
        src={client.logo_url}
        alt={client.name}
        className={cn(s, "rounded-md object-contain bg-white ring-1 ring-border shrink-0", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        s,
        "rounded-md bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0",
        className,
      )}
      title={client.name}
    >
      {client.name.charAt(0).toUpperCase()}
    </div>
  );
}
