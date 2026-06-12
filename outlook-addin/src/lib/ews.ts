import type { EmailItem } from "./types";

const T = `xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"`;
const M = `xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"`;

function envelope(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ${T} ${M}>
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2013_SP1"/>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function makeEwsRequest(xml: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!Office?.context?.mailbox?.makeEwsRequestAsync) {
      reject(new Error("EWS недоступен в этом контексте Outlook"));
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

function parseXml(xmlStr: string): Document {
  return new DOMParser().parseFromString(xmlStr, "text/xml");
}

function checkResponseError(doc: Document): void {
  const err = doc.querySelector("ResponseMessages [ResponseClass='Error'] MessageText, MessageText");
  const cls = doc.querySelector("[ResponseClass]")?.getAttribute("ResponseClass");
  if (cls === "Error" && err?.textContent) {
    throw new Error(`EWS: ${err.textContent}`);
  }
}

// ── FindItem: страница писем из Inbox ────────────────────────────────────────

export interface FindPage {
  emails: Omit<EmailItem, "body">[];
  totalCount: number;
  includesLastItem: boolean;
}

export async function findInboxPage(
  offset: number,
  pageSize: number,
  unreadOnly: boolean
): Promise<FindPage> {
  const restriction = unreadOnly
    ? `<m:Restriction>
        <t:IsEqualTo>
          <t:FieldURI FieldURI="message:IsRead"/>
          <t:FieldURIOrConstant><t:Constant Value="false"/></t:FieldURIOrConstant>
        </t:IsEqualTo>
      </m:Restriction>`
    : "";

  const xml = envelope(`
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>IdOnly</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Subject"/>
          <t:FieldURI FieldURI="item:DateTimeReceived"/>
          <t:FieldURI FieldURI="item:HasAttachments"/>
          <t:FieldURI FieldURI="item:Importance"/>
          <t:FieldURI FieldURI="item:ConversationId"/>
          <t:FieldURI FieldURI="message:IsRead"/>
          <t:FieldURI FieldURI="message:From"/>
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="${pageSize}" Offset="${offset}" BasePoint="Beginning"/>
      ${restriction}
      <m:SortOrder>
        <t:FieldOrder Order="Descending">
          <t:FieldURI FieldURI="item:DateTimeReceived"/>
        </t:FieldOrder>
      </m:SortOrder>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds>
    </m:FindItem>`);

  const doc = parseXml(await makeEwsRequest(xml));
  checkResponseError(doc);

  const rootFolder = doc.querySelector("RootFolder");
  const totalCount = Number(rootFolder?.getAttribute("TotalItemsInView") || 0);
  const includesLastItem = rootFolder?.getAttribute("IncludesLastItemInRange") === "true";

  const emails: Omit<EmailItem, "body">[] = [];
  doc.querySelectorAll("Message").forEach((msg) => {
    const itemId = msg.querySelector("ItemId");
    const id = itemId?.getAttribute("Id") || "";
    if (!id) return;
    emails.push({
      id,
      changeKey: itemId?.getAttribute("ChangeKey") || undefined,
      subject: msg.querySelector("Subject")?.textContent || "(без темы)",
      from: msg.querySelector("From EmailAddress")?.textContent || "",
      fromName: msg.querySelector("From Name")?.textContent || "",
      to: "",
      dateReceived: msg.querySelector("DateTimeReceived")?.textContent || "",
      conversationId: msg.querySelector("ConversationId")?.getAttribute("Id") || id,
      isRead: msg.querySelector("IsRead")?.textContent === "true",
      hasAttachments: msg.querySelector("HasAttachments")?.textContent === "true",
      importance: (msg.querySelector("Importance")?.textContent || "Normal") as EmailItem["importance"],
    });
  });

  return { emails, totalCount, includesLastItem };
}

// ── GetItem: тела писем батчем ───────────────────────────────────────────────

export async function getBodies(ids: string[]): Promise<Map<string, string>> {
  const idsXml = ids.map((id) => `<t:ItemId Id="${escapeXml(id)}"/>`).join("");
  const xml = envelope(`
    <m:GetItem>
      <m:ItemShape>
        <t:BaseShape>IdOnly</t:BaseShape>
        <t:BodyType>Text</t:BodyType>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="item:Body"/>
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:ItemIds>${idsXml}</m:ItemIds>
    </m:GetItem>`);

  const doc = parseXml(await makeEwsRequest(xml));
  const map = new Map<string, string>();
  doc.querySelectorAll("Message").forEach((msg) => {
    const id = msg.querySelector("ItemId")?.getAttribute("Id") || "";
    const body = (msg.querySelector("Body")?.textContent || "").trim().substring(0, 2000);
    if (id) map.set(id, body);
  });
  return map;
}

// ── Операции ─────────────────────────────────────────────────────────────────

/** Удалить в корзину */
export async function moveToTrash(ids: string[]): Promise<void> {
  const idsXml = ids.map((id) => `<t:ItemId Id="${escapeXml(id)}"/>`).join("");
  const xml = envelope(`
    <m:DeleteItem DeleteType="MoveToDeletedItems">
      <m:ItemIds>${idsXml}</m:ItemIds>
    </m:DeleteItem>`);
  const doc = parseXml(await makeEwsRequest(xml));
  checkResponseError(doc);
}

/** Найти (или создать) папку "Архив" в ящике */
let archiveFolderId: string | null = null;

export async function getArchiveFolderId(): Promise<string> {
  if (archiveFolderId) return archiveFolderId;

  // Ищем папку с именем Archive / Архив на верхнем уровне
  const findXml = envelope(`
    <m:FindFolder Traversal="Shallow">
      <m:FolderShape><t:BaseShape>IdOnly</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="folder:DisplayName"/>
        </t:AdditionalProperties>
      </m:FolderShape>
      <m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderIds>
    </m:FindFolder>`);

  const doc = parseXml(await makeEwsRequest(findXml));
  let found: string | null = null;
  doc.querySelectorAll("Folder").forEach((f) => {
    const name = f.querySelector("DisplayName")?.textContent?.toLowerCase();
    if (name === "archive" || name === "архив") {
      found = f.querySelector("FolderId")?.getAttribute("Id") || null;
    }
  });

  if (found) {
    archiveFolderId = found;
    return found;
  }

  // Создаём папку "Архив"
  const createXml = envelope(`
    <m:CreateFolder>
      <m:ParentFolderId><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderId>
      <m:Folders><t:Folder><t:DisplayName>Архив</t:DisplayName></t:Folder></m:Folders>
    </m:CreateFolder>`);
  const createDoc = parseXml(await makeEwsRequest(createXml));
  checkResponseError(createDoc);
  const newId = createDoc.querySelector("FolderId")?.getAttribute("Id");
  if (!newId) throw new Error("Не удалось создать папку Архив");
  archiveFolderId = newId;
  return newId;
}

/** Переместить в архивную папку */
export async function moveToArchive(ids: string[]): Promise<void> {
  const folderId = await getArchiveFolderId();
  const idsXml = ids.map((id) => `<t:ItemId Id="${escapeXml(id)}"/>`).join("");
  const xml = envelope(`
    <m:MoveItem>
      <m:ToFolderId><t:FolderId Id="${escapeXml(folderId)}"/></m:ToFolderId>
      <m:ItemIds>${idsXml}</m:ItemIds>
    </m:MoveItem>`);
  const doc = parseXml(await makeEwsRequest(xml));
  checkResponseError(doc);
}

/** Отметить прочитанным (нужен changeKey) */
export async function markAsRead(items: { id: string; changeKey?: string }[]): Promise<void> {
  const changes = items
    .filter((i) => i.changeKey)
    .map(
      (i) => `
      <t:ItemChange>
        <t:ItemId Id="${escapeXml(i.id)}" ChangeKey="${escapeXml(i.changeKey!)}"/>
        <t:Updates>
          <t:SetItemField>
            <t:FieldURI FieldURI="message:IsRead"/>
            <t:Message><t:IsRead>true</t:IsRead></t:Message>
          </t:SetItemField>
        </t:Updates>
      </t:ItemChange>`
    )
    .join("");

  if (!changes) return;

  const xml = envelope(`
    <m:UpdateItem ConflictResolution="AutoResolve" MessageDisposition="SaveOnly">
      <m:ItemChanges>${changes}</m:ItemChanges>
    </m:UpdateItem>`);
  const doc = parseXml(await makeEwsRequest(xml));
  checkResponseError(doc);
}
