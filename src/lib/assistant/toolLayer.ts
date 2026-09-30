import { z } from "zod";
import { ALL_TOOLS, TOOL_INSTRUCTIONS } from "../mcp/registry";
import { withAudit } from "../mcp/tools/_audit";

/**
 * Слой инструментов для ассистента ВНУТРИ приложения.
 *
 * Зачем он есть. Инструменты (33 штуки) писались для коннектора и живут в
 * `src/lib/mcp/tools/`. Внутренний ассистент их не видел: у него было два
 * собственных действия — создать задачу и спланировать проект, — и семнадцать
 * захардкоженных промптов рядом. Догонять вторым набором нельзя: два набора
 * разойдутся, и один и тот же запрос в приложении и в Cowork начнёт вести себя
 * по-разному. Это тот же класс расхождения, из-за которого пришлось сводить
 * дрифт в 19 местах и счётчики дашборда с PMO.
 *
 * Что здесь есть и чего нет. Здесь только каталог и запуск: описания в виде
 * JSON Schema (это то, что понимает модель) и вызов обработчика с проверкой
 * входа. Ни одного обращения к модели — выбор модели и цикл вызовов живут
 * отдельно, и этот файл от них не зависит. Значит его можно проверить тестами,
 * не поднимая ни модель, ни базу.
 */

// deno-lint-ignore-file no-explicit-any
type AnyTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any, ctx: any) => any;
};

const TOOLS: AnyTool[] = (ALL_TOOLS as unknown as AnyTool[]).map((t) => withAudit(t));
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export { TOOL_INSTRUCTIONS };

export type ToolCatalogEntry = {
  name: string;
  title: string | null;
  description: string;
  /** JSON Schema входа — то, что уходит модели. */
  input_schema: Record<string, unknown>;
  /** Только читает: такие вызовы можно выполнять без подтверждения человека. */
  read_only: boolean;
  /** Удаляет или необратимо меняет: подтверждение обязательно. */
  destructive: boolean;
};

/**
 * Схема описана у инструментов как набор полей (`{ task_id: z.string() }`), а
 * модели нужен объект целиком. Собираем и переводим в JSON Schema средствами
 * zod, а не своим конвертером: свой пришлось бы поддерживать вслед за каждым
 * новым типом в схемах, и расхождение обнаружилось бы отказом модели, а не
 * ошибкой сборки.
 */
function objectSchema(tool: AnyTool) {
  return z.object((tool.inputSchema ?? {}) as Record<string, z.ZodTypeAny>);
}

export function toolCatalog(): ToolCatalogEntry[] {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title ?? null,
    description: t.description ?? t.title ?? t.name,
    input_schema: z.toJSONSchema(objectSchema(t), { io: "input" }) as Record<string, unknown>,
    read_only: t.annotations?.readOnlyHint === true,
    destructive: t.annotations?.destructiveHint === true,
  }));
}

/** Контекст вызова: то же, что библиотека MCP даёт инструментам. */
export type AssistantContext = {
  token: string;
  userId: string;
  /** Чем вызвано: внутренний ассистент или что-то ещё. Уходит в журнал обращений. */
  clientId?: string;
};

export function makeToolContext(ctx: AssistantContext) {
  return {
    isAuthenticated: () => !!ctx.token && !!ctx.userId,
    getUserId: () => ctx.userId,
    getToken: () => ctx.token,
    getClientId: () => ctx.clientId ?? "in-app-assistant",
  };
}

export type ToolRunResult =
  | { ok: true; text: string; structured?: unknown }
  | { ok: false; error: string };

/**
 * Запуск инструмента. Вход проверяется схемой ДО обработчика: модель ошибается
 * в типах (строка вместо числа, «завтра» вместо даты), и отказ с понятным
 * текстом лучше, чем половина записанного действия.
 */
export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: AssistantContext,
): Promise<ToolRunResult> {
  const tool = BY_NAME.get(name);
  if (!tool) {
    return { ok: false, error: `Инструмента «${name}» нет. Доступные: ${[...BY_NAME.keys()].join(", ")}` };
  }
  if (!ctx.token || !ctx.userId) return { ok: false, error: "Не аутентифицирован" };

  const parsed = objectSchema(tool).safeParse(rawInput ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join(".") || "вход"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Неверные аргументы для ${name} — ${problems}` };
  }

  try {
    const result = await tool.handler(parsed.data, makeToolContext(ctx));
    const text = (result?.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text?: string }) => c.text ?? "")
      .join("\n");
    // Инструменты сообщают об отказе полем isError, а не исключением: для модели
    // это такой же ответ, из которого надо сделать вывод, а не сбой вызова.
    if (result?.isError) return { ok: false, error: text || "Инструмент вернул ошибку без текста" };
    return { ok: true, text, structured: result?.structuredContent };
  } catch (e) {
    // Исключение здесь — наш сбой, а не отказ инструмента. Текст отдаём модели,
    // чтобы она не повторяла тот же вызов, а стек пишем в лог функции.
    console.error(`assistant tool ${name} threw:`, (e as Error)?.stack ?? e);
    return { ok: false, error: `Сбой инструмента ${name}: ${(e as Error)?.message ?? e}` };
  }
}

/** Имена инструментов — для проверок и тестов. */
export function toolNames(): string[] {
  return [...BY_NAME.keys()];
}
