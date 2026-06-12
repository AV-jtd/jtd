import type { EmailItem } from "./types";
import { upsert } from "./store";

export function captureCurrentItem(): Promise<{ email: EmailItem; isNew: boolean } | null> {
  const item = Office?.context?.mailbox?.item;
  if (!item || !item.itemId) return Promise.resolve(null);

  return new Promise((resolve) => {
    item.body.getAsync(
      Office.CoercionType.Text,
      { asyncContext: item },
      (result) => {
        const ctx = result.asyncContext as Office.OutlookItem;
        const body =
          result.status === Office.AsyncResultStatus.Succeeded
            ? (result.value as string).trim().substring(0, 3000)
            : "";

        const email: EmailItem = {
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

        const { isNew } = upsert(email);
        resolve({ email, isNew });
      }
    );
  });
}
