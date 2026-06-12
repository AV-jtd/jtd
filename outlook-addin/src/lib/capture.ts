import type { EmailItem } from "./types";
import { getEmail, putEmails } from "./db";

export async function captureCurrentItem(): Promise<{ email: EmailItem; isNew: boolean } | null> {
  const item = Office?.context?.mailbox?.item;
  if (!item || !item.itemId) return null;

  return new Promise((resolve) => {
    item.body.getAsync(
      Office.CoercionType.Text,
      { asyncContext: item },
      async (result) => {
        const ctx = result.asyncContext as Office.OutlookItem;
        const body =
          result.status === Office.AsyncResultStatus.Succeeded
            ? (result.value as string).trim().substring(0, 3000)
            : "";

        const existing = await getEmail(ctx.itemId || "");

        const email: EmailItem = {
          // Сохраняем категорию, если письмо уже было категоризировано
          ...(existing || {}),
          id: ctx.itemId || "",
          subject: ctx.subject || "(без темы)",
          from: ctx.from?.emailAddress || "",
          fromName: ctx.from?.displayName || ctx.from?.emailAddress || "",
          to: ctx.to?.[0]?.emailAddress || "",
          dateReceived: ctx.dateTimeCreated?.toISOString() || new Date().toISOString(),
          body,
          conversationId: ctx.conversationId || ctx.itemId || "",
          isRead: true,
          hasAttachments: (ctx.attachments?.length || 0) > 0,
          importance: "Normal",
        };

        await putEmails([email]);
        resolve({ email, isNew: !existing });
      }
    );
  });
}
