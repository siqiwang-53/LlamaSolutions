import {
  AttachmentError,
  attachmentDisplayName,
  type DocumentMediaType,
  decodeDataUrl,
  EMPTY_FILE_MESSAGE,
  fileTooLargeMessage,
  IMAGE_NEEDS_VISION_MESSAGE,
  isVercelBlobUrl,
  MAX_DOCUMENT_BYTES,
  MAX_FILES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  resolveMediaType,
  TOO_MANY_FILES_MESSAGE,
} from "@/lib/attachments";
import { buildDocumentContext } from "@/lib/attachments/document-context";
import { extractDocumentText } from "@/lib/attachments/extract-text";
import type { ChatMessage } from "@/lib/types";

type UiPart = ChatMessage["parts"][number];
type FilePart = Extract<UiPart, { type: "file" }> & { name?: string };

type PendingDocument = {
  fatal: boolean;
  mediaType: DocumentMediaType;
  name: string;
  url: string;
};

function isFilePart(part: UiPart): part is FilePart {
  return part.type === "file";
}

async function readDocumentBytes(url: string, name: string) {
  try {
    if (url.startsWith("data:")) {
      return assertByteLimit(
        decodeDataUrl(url),
        MAX_DOCUMENT_BYTES,
        fileTooLargeMessage("document")
      );
    }

    if (!isVercelBlobUrl(url)) {
      throw new AttachmentError(
        `Could not read "${name}". Upload it again from the chat box.`
      );
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new AttachmentError(`Could not read "${name}". Upload it again.`);
    }

    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > MAX_DOCUMENT_BYTES) {
      throw new AttachmentError(fileTooLargeMessage("document"));
    }

    return assertByteLimit(
      new Uint8Array(await response.arrayBuffer()),
      MAX_DOCUMENT_BYTES,
      fileTooLargeMessage("document")
    );
  } catch (error) {
    if (error instanceof AttachmentError) {
      throw error;
    }
    throw new AttachmentError(`Could not read "${name}". Upload it again.`, {
      cause: error,
    });
  }
}

function assertByteLimit(bytes: Uint8Array, limit: number, message: string) {
  if (bytes.byteLength === 0) {
    throw new AttachmentError(EMPTY_FILE_MESSAGE);
  }
  if (bytes.byteLength > limit) {
    throw new AttachmentError(message);
  }
  return bytes;
}

function assertImageUrl(url: string) {
  if (!url.startsWith("data:")) {
    return;
  }
  assertByteLimit(
    decodeDataUrl(url),
    MAX_IMAGE_BYTES,
    fileTooLargeMessage("image")
  );
}

function textOf(parts: UiPart[]) {
  return parts
    .filter((part) => part.type === "text" && "text" in part)
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n")
    .trim();
}

function stillLoadedNote(name: string) {
  return `Document "${name}" is still loaded in this chat. Relevant excerpts are included with the latest question.`;
}

async function loadDocuments(documents: PendingDocument[]) {
  const unique = new Map<string, PendingDocument>();
  for (const document of documents) {
    const existing = unique.get(document.url);
    if (!existing) {
      unique.set(document.url, document);
      continue;
    }
    if (document.fatal) {
      existing.fatal = true;
    }
  }

  return await Promise.all(
    [...unique.values()].map(async (document) => {
      try {
        const bytes = await readDocumentBytes(document.url, document.name);
        const text = await extractDocumentText({
          bytes,
          mediaType: document.mediaType,
          name: document.name,
        });
        return { document, text };
      } catch (error) {
        if (document.fatal) {
          if (error instanceof AttachmentError) {
            throw error;
          }
          throw new AttachmentError(`Could not read "${document.name}".`, {
            cause: error,
          });
        }
        return {
          document,
          error:
            error instanceof AttachmentError
              ? error.message
              : `An earlier attachment named "${document.name}" could not be read.`,
        };
      }
    })
  );
}

export async function prepareMessagesForModel(
  messages: ChatMessage[],
  options: { latestUserMessageId?: string; supportsVision: boolean }
) {
  const lastUserId = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.id;
  const anchorId = options.latestUserMessageId ?? lastUserId;
  const strict = Boolean(options.latestUserMessageId);
  const pending: PendingDocument[] = [];
  const seenUrls = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    const isStrictLatest = strict && message.id === options.latestUserMessageId;
    const fileCount = message.parts.filter(isFilePart).length;
    if (isStrictLatest && fileCount > MAX_FILES_PER_MESSAGE) {
      throw new AttachmentError(TOO_MANY_FILES_MESSAGE);
    }

    for (const part of message.parts) {
      if (!isFilePart(part)) {
        continue;
      }
      const name = attachmentDisplayName(part);
      const resolved = resolveMediaType(name, part.mediaType);
      if ("error" in resolved || resolved.kind !== "document") {
        continue;
      }
      if (seenUrls.has(part.url)) {
        continue;
      }
      seenUrls.add(part.url);
      pending.push({
        fatal: isStrictLatest,
        mediaType: resolved.mediaType as DocumentMediaType,
        name,
        url: part.url,
      });
    }
  }

  const loaded = await loadDocuments(pending);
  const readable = loaded.flatMap((item) => {
    if (!("text" in item) || typeof item.text !== "string") {
      return [];
    }
    return [
      {
        mediaType: item.document.mediaType,
        name: item.document.name,
        text: item.text,
        url: item.document.url,
      },
    ];
  });
  const failures = new Map(
    loaded.flatMap((item) =>
      "error" in item ? [[item.document.url, item.error] as const] : []
    )
  );

  const query = messages
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => textOf(message.parts))
    .filter((text) => text.length > 0)
    .join("\n")
    .slice(-1500);

  const context =
    readable.length > 0 ? buildDocumentContext(readable, query) : null;
  const readableUrls = new Set(readable.map((item) => item.url));

  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    const isAnchor = message.id === anchorId;
    const isStrictLatest = strict && message.id === options.latestUserMessageId;
    const noted = new Set<string>();
    const rewritten: UiPart[] = [];

    for (const part of message.parts) {
      if (!isFilePart(part)) {
        rewritten.push(part);
        continue;
      }

      const name = attachmentDisplayName(part);
      const resolved = resolveMediaType(name, part.mediaType);
      if ("error" in resolved) {
        if (isStrictLatest) {
          throw new AttachmentError(resolved.error);
        }
        rewritten.push({
          text: `An earlier attachment named "${name}" was skipped because its file type is not supported.`,
          type: "text",
        });
        continue;
      }

      if (resolved.kind === "image") {
        if (!options.supportsVision) {
          if (isStrictLatest) {
            throw new AttachmentError(IMAGE_NEEDS_VISION_MESSAGE);
          }
          rewritten.push({
            text: `An earlier message included an image named "${name}". This model cannot view images.`,
            type: "text",
          });
          continue;
        }

        if (isStrictLatest) {
          assertImageUrl(part.url);
        }

        rewritten.push({
          filename: name,
          mediaType: resolved.mediaType,
          type: "file",
          url: part.url,
        });
        continue;
      }

      if (failures.has(part.url)) {
        rewritten.push({
          text:
            failures.get(part.url) ??
            `An earlier attachment named "${name}" could not be read.`,
          type: "text",
        });
        continue;
      }

      if (!readableUrls.has(part.url)) {
        continue;
      }

      if (!isAnchor && !noted.has(part.url)) {
        noted.add(part.url);
        rewritten.push({
          text: stillLoadedNote(name),
          type: "text",
        });
      }
    }

    if (isAnchor && context) {
      rewritten.unshift({ text: context, type: "text" });
    }

    return {
      ...message,
      parts: rewritten,
    };
  });
}
