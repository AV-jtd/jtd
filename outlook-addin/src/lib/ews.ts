import type { EmailItem } from "./types";

// EWS XML builders
function buildFindItemRequest(
  folderName: string,
  maxItems: number,
  restriction?: string
): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
      </m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="${maxItems}" Offset="0" BasePoint="Beginning"/>
      ${restriction || ""}
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="${folderName}"/>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;
}

function buildGetItemRequest(itemIds: string[]): string {
  const ids = itemIds
    .map((id) => `<t:ItemId Id="${id}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Body>
    <m:GetItem>
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
        <t:IncludeMimeContent>false</t:IncludeMimeContent>
        <t:BodyType>Text</t:BodyType>
      </m:ItemShape>
      <m:ItemIds>
        ${ids}
      </m:ItemIds>
    </m:GetItem>
  </soap:Body>
</soap:Envelope>`;
}

function buildTodayRestriction(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startStr = start.toISOString();
  return `<m:Restriction>
    <t:IsGreaterThanOrEqualTo>
      <t:FieldURI FieldURI="item:DateTimeReceived"/>
      <t:FieldURIOrConstant>
        <t:Constant Value="${startStr}"/>
      </t:FieldURIOrConstant>
    </t:IsGreaterThanOrEqualTo>
  </m:Restriction>`;
}

function makeEwsRequest(xml: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Office?.context?.mailbox?.makeEwsRequestAsync) {
      reject(new Error("EWS не доступен в данном контексте"));
      return;
    }
    Office.context.mailbox.makeEwsRequestAsync(xml, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value as string);
      } else {
        reject(new Error(result.error?.message || "EWS request failed"));
      }
    });
  });
}

function parseEmailsFromFindItem(xmlStr: string): { id: string; subject: string; from: string; fromName: string; to: string; dateReceived: string; conversationId: string; isRead: boolean; hasAttachments: boolean; importance: string }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const messages = doc.querySelectorAll("Message");
  const results: ReturnType<typeof parseEmailsFromFindItem> = [];

  messages.forEach((msg) => {
    const id = msg.querySelector("ItemId")?.getAttribute("Id") || "";
    const subject = msg.querySelector("Subject")?.textContent || "(без темы)";
    const fromEmail = msg.querySelector("From Mailbox EmailAddress")?.textContent || "";
    const fromName = msg.querySelector("From Mailbox Name")?.textContent || fromEmail;
    const to = msg.querySelector("ToRecipients Mailbox EmailAddress")?.textContent || "";
    const dateReceived = msg.querySelector("DateTimeReceived")?.textContent || "";
    const conversationId = msg.querySelector("ConversationId")?.getAttribute("Id") || id;
    const isRead = msg.querySelector("IsRead")?.textContent === "true";
    const hasAttachments = msg.querySelector("HasAttachments")?.textContent === "true";
    const importance = (msg.querySelector("Importance")?.textContent || "Normal") as "Low" | "Normal" | "High";

    if (id) {
      results.push({ id, subject, from: fromEmail, fromName, to, dateReceived, conversationId, isRead, hasAttachments, importance });
    }
  });

  return results;
}

function parseBodyFromGetItem(xmlStr: string): Map<string, string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, "text/xml");
  const messages = doc.querySelectorAll("Message");
  const map = new Map<string, string>();
  messages.forEach((msg) => {
    const id = msg.querySelector("ItemId")?.getAttribute("Id") || "";
    const body = msg.querySelector("Body")?.textContent || "";
    if (id) map.set(id, body.trim().substring(0, 2000));
  });
  return map;
}

export async function fetchTodayEmails(maxItems = 200): Promise<EmailItem[]> {
  const restriction = buildTodayRestriction();
  const findXml = buildFindItemRequest("inbox", maxItems, restriction);

  const findResult = await makeEwsRequest(findXml);
  const partials = parseEmailsFromFindItem(findResult);

  if (partials.length === 0) return [];

  // Fetch bodies in batches of 10
  const batchSize = 10;
  const bodyMap = new Map<string, string>();
  for (let i = 0; i < partials.length; i += batchSize) {
    const batch = partials.slice(i, i + batchSize);
    const getXml = buildGetItemRequest(batch.map((e) => e.id));
    const getResult = await makeEwsRequest(getXml);
    const batchBodies = parseBodyFromGetItem(getResult);
    batchBodies.forEach((v, k) => bodyMap.set(k, v));
  }

  return partials.map((p) => ({
    ...p,
    body: bodyMap.get(p.id) || "",
    importance: p.importance as "Low" | "Normal" | "High",
  }));
}

export async function fetchCurrentEmail(): Promise<EmailItem | null> {
  const item = Office?.context?.mailbox?.item;
  if (!item) return null;

  return new Promise((resolve) => {
    item.body.getAsync(Office.CoercionType.Text, { asyncContext: item }, (result) => {
      const ctx = result.asyncContext as Office.OutlookItem;
      const body = result.status === Office.AsyncResultStatus.Succeeded
        ? (result.value as string).substring(0, 3000)
        : "";

      resolve({
        id: ctx.itemId || "",
        subject: ctx.subject || "(без темы)",
        from: ctx.from?.emailAddress || "",
        fromName: ctx.from?.displayName || ctx.from?.emailAddress || "",
        to: ctx.to?.[0]?.emailAddress || "",
        dateReceived: ctx.dateTimeCreated?.toISOString() || new Date().toISOString(),
        body,
        conversationId: ctx.conversationId || "",
        isRead: true,
        hasAttachments: (ctx.attachments?.length || 0) > 0,
        importance: "Normal",
      });
    });
  });
}
