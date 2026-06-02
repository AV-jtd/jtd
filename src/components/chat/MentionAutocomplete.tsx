import { AtSign } from "lucide-react";
import type { Profile } from "@/hooks/useTasks";

/** @handle для пользователя: username → telegram_username → display_name (snake_case). */
export function userMentionHandle(u: Profile): string {
  return (
    (u as any).username ||
    (u as any).telegram_username ||
    (u.display_name || "user").replace(/\s+/g, "_")
  ).toString();
}

/** Читаемая подпись для @-упоминания: имя пользователя (если есть), иначе хэндл. */
export function userMentionLabel(u: Profile): string {
  return (u.display_name || userMentionHandle(u)).toString();
}

/**
 * Popup-подсказка участников при наборе `@` в конце слова.
 * Появляется над полем ввода. Выбор — кликом мыши.
 */
export default function MentionAutocomplete({
  value,
  users,
  onPick,
}: {
  value: string;
  users: Profile[];
  onPick: (u: Profile) => void;
}) {
  const m = value.match(/@([A-Za-zА-Яа-яЁё0-9_.\-]*)$/);
  if (!m) return null;
  const query = m[1].toLowerCase();

  const matches = users
    .filter((u) => {
      const dn = (u.display_name || "").toLowerCase();
      const uname = ((u as any).username || "").toLowerCase();
      const tg = ((u as any).telegram_username || "").toLowerCase();
      if (!query) return true;
      return dn.includes(query) || uname.includes(query) || tg.includes(query);
    })
    .slice(0, 6);

  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 right-4 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border flex items-center gap-1">
        <AtSign className="h-3 w-3" /> Упомянуть
      </div>
      <div className="max-h-56 overflow-y-auto">
        {matches.map((u) => {
          const handle = userMentionHandle(u);
          return (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(u);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
            >
              <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                {(u.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{u.display_name || "Без имени"}</p>
                <p className="text-[10px] text-muted-foreground truncate">@{handle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Найти ID пользователей, упомянутых через @ в тексте.
 * Сопоставляет по имени (display_name), а также по username / telegram_username
 * и snake_case-варианту имени. Имя может содержать пробелы, поэтому ищем
 * вхождение «@<имя>» в тексте для каждого пользователя.
 */
export function resolveMentionedUserIds(text: string, users: Profile[]): string[] {
  if (!text.includes("@")) return [];
  const lower = text.toLowerCase();
  return users
    .filter((u) => {
      const candidates = [
        u.display_name || "",
        (u as any).username || "",
        (u as any).telegram_username || "",
        (u.display_name || "").replace(/\s+/g, "_"),
      ]
        .map((c) => c.toLowerCase().trim())
        .filter((c) => c.length >= 2);
      return candidates.some((c) => lower.includes(`@${c}`));
    })
    .map((u) => u.id)
    .filter(Boolean);
}
