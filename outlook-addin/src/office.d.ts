// Minimal Office.js type declarations for Exchange 2019 add-in
declare namespace Office {
  const context: {
    mailbox: {
      item: OutlookItem | null;
      makeEwsRequestAsync(
        data: string,
        callback: (result: AsyncResult<string>) => void
      ): void;
    };
  };

  function onReady(callback: () => void): void;

  const AsyncResultStatus: {
    Succeeded: "succeeded";
    Failed: "failed";
  };

  const CoercionType: {
    Text: "text";
    Html: "html";
  };

  interface AsyncResult<T> {
    status: string;
    value: T;
    error?: { message: string };
    asyncContext?: unknown;
  }

  interface OutlookItem {
    itemId: string;
    subject: string;
    from: Recipient;
    to: Recipient[];
    attachments: unknown[];
    conversationId: string;
    dateTimeCreated: Date;
    body: {
      getAsync(
        coercionType: string,
        options: { asyncContext?: unknown },
        callback: (result: AsyncResult<string>) => void
      ): void;
    };
  }

  interface Recipient {
    emailAddress: string;
    displayName: string;
  }
}
