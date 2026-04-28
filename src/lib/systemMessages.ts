/**
 * Системные сообщения (создаются автоматически бэкендом / триггерами).
 * Формат маркера в `task_comments.content` / `group_messages.content`:
 *   __sys_<event>__:<entity_id>|<human_text>
 *
 * Сейчас используется один тип:
 *   __sys_task_created__:<task_id>|<task_title>
 *   → «➕ Создана задача: <task_title>»
 */

export type SystemMessage = {
  isSystem: true;
  event: "task_created";
  entityId: string;
  text: string;
  /** Готовая строка для отображения. */
  display: string;
};

const SYS_PREFIX = "__sys_";

export function parseSystemMessage(content: string | null | undefined): SystemMessage | null {
  if (!content || typeof content !== "string") return null;
  if (!content.startsWith(SYS_PREFIX)) return null;

  // __sys_<event>__:<id>|<text>
  const match = content.match(/^__sys_([a-z_]+)__:([0-9a-f-]+)\|?(.*)$/i);
  if (!match) return null;
  const [, event, entityId, rest] = match;

  if (event === "task_created") {
    const text = (rest || "").trim();
    return {
      isSystem: true,
      event: "task_created",
      entityId,
      text,
      display: text ? `➕ Создана задача: ${text}` : "➕ Создана задача",
    };
  }

  // Неизвестный системный тип — прячем сырой маркер, показываем нейтрально.
  return {
    isSystem: true,
    event: "task_created",
    entityId,
    text: rest?.trim() || "",
    display: rest?.trim() || "Системное сообщение",
  };
}

/** Удобный хелпер для превью в списках чатов. */
export function formatMessagePreview(content: string | null | undefined): string {
  if (!content) return "";
  const sys = parseSystemMessage(content);
  return sys ? sys.display : content;
}
