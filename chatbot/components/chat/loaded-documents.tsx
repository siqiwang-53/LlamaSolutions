"use client";

import { listLoadedDocuments } from "@/lib/attachments";
import type { ChatMessage } from "@/lib/types";

export function LoadedDocumentsNotice({
  messages,
}: {
  messages: ChatMessage[];
}) {
  const documents = listLoadedDocuments(messages);
  if (documents.length === 0) {
    return null;
  }

  const names = documents.map((document) => document.name).join(", ");
  const label =
    documents.length === 1
      ? `${documents[0]?.label ?? "Document"} loaded: ${documents[0]?.name ?? "file"}. You can ask follow-up questions about it.`
      : `${documents.length} documents are loaded in this chat: ${names}. You can ask follow-up questions about them.`;

  return (
    <p
      className="rounded-xl border border-border/50 bg-muted/70 px-3 py-2 text-[12px] text-muted-foreground leading-relaxed"
      data-testid="loaded-documents"
    >
      {label}
    </p>
  );
}
