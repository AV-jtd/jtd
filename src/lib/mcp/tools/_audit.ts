// Журнал обращений (этап 4в): каждый вызов инструмента — строка в
// public.mcp_audit_log (миграция 20260927210000). Пишется токеном самого
// пользователя, поэтому RLS гарантирует, что строка его.
//
// Сбой записи журнала действие не ломает, но и не теряется молча: уходит в лог
// функции. Аргументы пишутся как есть — в них тема и отправитель письма; журнал
// видят только сам пользователь и администраторы.

import type { ToolContext } from "@lovable.dev/mcp-js";
import { db } from "./_shared";

type Result = { isError?: boolean; content?: Array<{ type: string; text?: string }> } | null | undefined;
// Тип обработчика в библиотеке зависит от схемы каждого инструмента; обёртке
// нужны только имя и сам вызов.
// deno-lint-ignore no-explicit-any
type AnyTool = { name: string; handler: (...a: any[]) => any };

export function withAudit<T extends AnyTool>(tool: T): T {
  return {
    ...tool,
    handler: async (args: unknown, ctx: ToolContext) => {
      const start = Date.now();
      let result: Result;
      let thrown: unknown;
      try {
        result = (await tool.handler(args, ctx)) as Result;
      } catch (e) {
        thrown = e;
      }
      if (ctx.isAuthenticated()) {
        const isError = thrown !== undefined || !result || result.isError === true;
        const error = thrown !== undefined
          ? String((thrown as Error)?.message ?? thrown).slice(0, 1000)
          : isError ? (result?.content?.[0]?.text ?? "пустой результат").slice(0, 1000) : null;
        try {
          const { error: e } = await db(ctx).from("mcp_audit_log").insert({
            client_id: ctx.getClientId() ?? null,
            tool: tool.name,
            args: args ?? null,
            outcome: isError ? "error" : "ok",
            error,
            duration_ms: Date.now() - start,
          });
          if (e) console.error("mcp_audit_log:", e.message);
        } catch (e) {
          console.error("mcp_audit_log:", (e as Error)?.message ?? e);
        }
      }
      if (thrown !== undefined) {
        // Библиотека превращает исключение в безликое «tool execution failed» и
        // ничего не логирует — 27.09 это спрятало сбой всех инструментов.
        console.error(`mcp tool ${tool.name} threw:`, (thrown as Error)?.stack ?? thrown);
        throw thrown;
      }
      return result;
    },
  } as T;
}
