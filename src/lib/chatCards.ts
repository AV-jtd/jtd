import { CheckSquare, UserCheck, FileText, BarChart3, type LucideIcon } from "lucide-react";

/**
 * Единый реестр system-карточек чата.
 *
 * Карточка — это сообщение в `group_messages` (или зеркало в TG/MAX), помеченное
 * `external_message_id` вида `<prefix><entityId>`. Реестр — единственный источник
 * правды: добавив сюда новый тип, он автоматически:
 *   • распознаётся и рендерится в ленте чата (SystemCard),
 *   • корректно показывается в превью списков чатов (chatCardPreview),
 *   • единообразно форматируется при зеркалировании в Telegram/MAX.
 *
 * Текстовое тело карточки следует общему формату, который понимает parseChatCard:
 *   «<Заголовок>» · 👤 <Ответственный> · 📅 <Срок>
 */
export type ChatCardKind =
  | "task_created"
  | "assignment_created"
  | "protocol_linked"
  | "metric_logged";

export interface ChatCardDef {
  kind: ChatCardKind;
  /** Префикс external_message_id, помечающий карточку этого типа. */
  prefix: string;
  icon: LucideIcon;
  /** Подпись в карточке, напр. «Создана задача». */
  label: string;
  /** Tailwind-тон пилюли (фон + текст) через семантические токены. */
  tone: string;
  /** Куда вести по клику. */
  target: "task" | "protocol" | "none";
}

export const CHAT_CARD_DEFS: ChatCardDef[] = [
  {
    kind: "task_created",
    prefix: "task-created:",
    icon: CheckSquare,
    label: "Создана задача",
    tone: "bg-primary/10 text-primary",
    target: "task",
  },
  {
    kind: "assignment_created",
    prefix: "assignment-created:",
    icon: UserCheck,
    label: "Поручение",
    tone: "bg-tag-purple/10 text-tag-purple",
    target: "task",
  },
  {
    kind: "protocol_linked",
    prefix: "protocol-linked:",
    icon: FileText,
    label: "Протокол",
    tone: "bg-tag-blue/10 text-tag-blue",
    target: "protocol",
  },
  {
    kind: "metric_logged",
    prefix: "metric-logged:",
    icon: BarChart3,
    label: "Показатель",
    tone: "bg-tag-green/10 text-tag-green",
    target: "none",
  },
];

export function getChatCardDef(kind: ChatCardKind): ChatCardDef {
  return CHAT_CARD_DEFS.find((d) => d.kind === kind) ?? CHAT_CARD_DEFS[0];
}

export interface ParsedChatCard {
  def: ChatCardDef;
  /** id сущности (задача / протокол / …). */
  entityId: string;
  title: string;
  assigneeName?: string;
  deadlineLabel?: string;
}

/**
 * Распознаёт system-карточку по external_message_id + содержимому.
 * Возвращает null, если сообщение — обычный текст.
 */
export function parseChatCard(
  externalMessageId: string | null | undefined,
  content: string | null | undefined,
): ParsedChatCard | null {
  const ext = externalMessageId || "";
  const def = CHAT_CARD_DEFS.find((d) => ext.startsWith(d.prefix));
  if (!def) return null;
  const entityId = ext.slice(def.prefix.length);
  if (!entityId) return null;

  const body = content || "";
  const titleMatch = body.match(/«([\s\S]*?)»/);
  const title = titleMatch?.[1]?.trim() || "Без названия";
  const assigneeName = body.match(/👤\s*([^·\n]+)/)?.[1]?.trim() || undefined;
  const deadlineLabel = body.match(/📅\s*([^·\n]+)/)?.[1]?.trim() || undefined;

  return { def, entityId, title, assigneeName, deadlineLabel };
}

/** Текст для превью в списках чатов. */
export function chatCardPreview(card: ParsedChatCard): string {
  return `${card.def.label}: ${card.title}`;
}

/** Маркер external_message_id для записи карточки в group_messages. */
export function chatCardMarker(kind: ChatCardKind, entityId: string): string {
  return `${getChatCardDef(kind).prefix}${entityId}`;
}

/** Единый текст тела карточки для ленты и зеркал TG/MAX. */
export function formatChatCardBody(
  kind: ChatCardKind,
  title: string,
  opts?: { assigneeName?: string | null; deadlineLabel?: string | null },
): string {
  const def = getChatCardDef(kind);
  let body = `${def.label}: «${title}»`;
  if (opts?.assigneeName) body += ` · 👤 ${opts.assigneeName}`;
  if (opts?.deadlineLabel) body += ` · 📅 ${opts.deadlineLabel}`;
  return body;
}
