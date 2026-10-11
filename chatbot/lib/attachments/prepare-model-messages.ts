import {
  AttachmentError,
  attachmentDisplayName,
  type DocumentMediaType,
  decodeDataUrl,
  EMPTY_FILE_MESSAGE,
  fileTooLargeMessage,
  formatDocumentForModel,
  IMAGE_NEEDS_VISION_MESSAGE,
  isVercelBlobUrl,
  MAX_DOCUMENT_BYTES,
  MAX_EXTRACTED_CHARS_TOTAL,
  MAX_FILES_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  resolveMediaType,
  TOO_MANY_FILES_MESSAGE,
} from "@/lib/attachments";
import { extractDocumentText } from "@/lib/attachments/extract-text";
import type { ChatMessage } from "@/lib/types";

type UiPart = ChatMessage["parts"][number];
type FilePart = Extract<UiPart, { type: "file" }> & { name?: string };

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

function consumeExtractedText(text: string, budget: { remaining: number }) {
  if (budget.remaining <= 0) {
    return null;
  }

  if (text.length <= budget.remaining) {
    budget.remaining -= text.length;
    return text;
  }

  const slice = text.slice(0, budget.remaining);
  budget.remaining = 0;
  return `${slice}\n\n[The extracted text was cut off to fit the message limit.]`;
}

async function rewriteUserParts(
  parts: UiPart[],
  options: { isLatest: boolean; supportsVision: boolean },
  budget: { remaining: number }
) {
  const fileCount = parts.filter(isFilePart).length;
  if (options.isLatest && fileCount > MAX_FILES_PER_MESSAGE) {
    throw new AttachmentError(TOO_MANY_FILES_MESSAGE);
  }

  const rewritten: UiPart[] = [];

  for (const part of parts) {
    if (!isFilePart(part)) {
      rewritten.push(part);
      continue;
    }

    const name = attachmentDisplayName(part);
    const resolved = resolveMediaType(name, part.mediaType);
    if ("error" in resolved) {
      if (options.isLatest) {
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
        if (options.isLatest) {
          throw new AttachmentError(IMAGE_NEEDS_VISION_MESSAGE);
        }
        rewritten.push({
          text: `An earlier message included an image named "${name}". This model cannot view images.`,
          type: "text",
        });
        continue;
      }

      if (options.isLatest) {
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

    try {
      // Later files in the same message share one text budget, so they are read in order.
      // biome-ignore lint/performance/noAwaitInLoops: shared extraction budget
      const bytes = await readDocumentBytes(part.url, name);
      const extracted = await extractDocumentText({
        bytes,
        mediaType: resolved.mediaType as DocumentMediaType,
        name,
      });
      const fitted = consumeExtractedText(extracted, budget);
      rewritten.push({
        text: fitted
          ? formatDocumentForModel(name, resolved.mediaType, fitted)
          : `Attached file "${name}" was not included because the message is already long.`,
        type: "text",
      });
    } catch (error) {
      if (!options.isLatest) {
        rewritten.push({
          text: `An earlier attachment named "${name}" could not be read.`,
          type: "text",
        });
        continue;
      }
      if (error instanceof AttachmentError) {
        throw error;
      }
      throw new AttachmentError(`Could not read "${name}".`, { cause: error });
    }
  }

  return rewritten;
}

export async function prepareMessagesForModel(
  messages: ChatMessage[],
  options: { latestUserMessageId?: string; supportsVision: boolean }
) {
  const budget = { remaining: MAX_EXTRACTED_CHARS_TOTAL };
  const next: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user") {
      next.push(message);
      continue;
    }

    next.push({
      ...message,
      // Each message draws from the same extraction budget as the ones before it.
      // biome-ignore lint/performance/noAwaitInLoops: shared extraction budget
      parts: await rewriteUserParts(
        message.parts,
        {
          isLatest: message.id === options.latestUserMessageId,
          supportsVision: options.supportsVision,
        },
        budget
      ),
    });
  }

  return next;
}
