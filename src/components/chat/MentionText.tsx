import { Fragment } from "react";
import { AtSign, Mail, Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { userMentionHandle } from "./MentionAutocomplete";
import type { Profile } from "@/hooks/useTasks";

/** Кандидаты-подписи пользователя для поиска @-упоминания в тексте. */
function mentionCandidates(u: Profile): string[] {
  return [
    u.display_name || "",
    (u as any).username || "",
    (u as any).telegram_username || "",
    (u.display_name || "").replace(/\s+/g, "_"),
  ]
    .map((c) => c.trim())
    .filter((c) => c.length >= 2);
}

/** Мини-карточка профиля упомянутого пользователя (по user_id). */
function MentionChip({ user, raw }: { user: Profile; raw: string }) {
  const handle = userMentionHandle(user);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-medium text-primary hover:underline underline-offset-2 rounded px-0.5 -mx-0.5 hover:bg-primary/10 transition-colors"
        >
          {raw}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-primary/15 text-primary text-sm font-semibold flex items-center justify-center shrink-0">
            {(user.display_name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user.display_name || "Без имени"}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <AtSign className="h-3 w-3" />{handle}
            </p>
          </div>
        </div>
        {(user.email || (user as any).telegram_username) && (
          <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
            {user.email && (
              <a
                href={`mailto:${user.email}`}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />{user.email}
              </a>
            )}
            {(user as any).telegram_username && (
              <a
                href={`https://t.me/${String((user as any).telegram_username).replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                <Send className="h-3.5 w-3.5 shrink-0" />@{String((user as any).telegram_username).replace(/^@/, "")}
              </a>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Отрисовка текста сообщения с подсветкой и кликабельными @-упоминаниями.
 * Каждое упоминание сопоставляется с конкретным пользователем по подписи
 * (имя / username / telegram), а клик открывает мини-профиль по его user_id.
 */
export default function MentionText({
  content,
  users,
  className,
}: {
  content: string;
  users: Profile[];
  className?: string;
}) {
  // Кандидаты, отсортированные по длине (сначала самые длинные — «Имя Фамилия»
  // имеет приоритет над одиночным ником), чтобы матчить максимально точно.
  const candidates = users
    .flatMap((u) => mentionCandidates(u).map((label) => ({ label, lower: label.toLowerCase(), user: u })))
    .sort((a, b) => b.label.length - a.label.length);

  const nodes: Array<string | { raw: string; user: Profile }> = [];
  let buffer = "";
  let i = 0;

  while (i < content.length) {
    if (content[i] === "@") {
      const rest = content.slice(i + 1);
      const restLower = rest.toLowerCase();
      const hit = candidates.find(
        (c) =>
          restLower.startsWith(c.lower) &&
          // следующий символ не должен быть «продолжением слова», иначе
          // «@Иванова» не должно матчиться кандидатом «Иван».
          !/[A-Za-zА-Яа-яЁё0-9_]/.test(rest.charAt(c.label.length)),
      );
      if (hit) {
        if (buffer) { nodes.push(buffer); buffer = ""; }
        nodes.push({ raw: `@${rest.slice(0, hit.label.length)}`, user: hit.user });
        i += 1 + hit.label.length;
        continue;
      }
    }
    buffer += content[i];
    i++;
  }
  if (buffer) nodes.push(buffer);

  return (
    <p className={className}>
      {nodes.map((n, idx) =>
        typeof n === "string" ? (
          <Fragment key={idx}>{n}</Fragment>
        ) : (
          <MentionChip key={idx} user={n.user} raw={n.raw} />
        ),
      )}
    </p>
  );
}