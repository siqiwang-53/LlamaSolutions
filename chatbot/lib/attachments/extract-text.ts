import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { extractText, extractTextItems, getDocumentProxy } from "unpdf";
import {
  AttachmentError,
  type DocumentMediaType,
  limitExtractedText,
  MAX_INDEXED_CHARS,
} from "@/lib/attachments";
import { choosePageText, layoutPageItems } from "@/lib/attachments/layout-text";

const extractedCache = new Map<string, string>();
const MAX_CACHED_DOCUMENTS = 12;

function rememberExtractedText(key: string, text: string) {
  extractedCache.delete(key);
  extractedCache.set(key, text);
  while (extractedCache.size > MAX_CACHED_DOCUMENTS) {
    const oldest = extractedCache.keys().next().value;
    if (!oldest) {
      break;
    }
    extractedCache.delete(oldest);
  }
}

function decodePlainText(name: string, bytes: Uint8Array) {
  const sample = bytes.subarray(0, 8000);
  for (const byte of sample) {
    if (byte === 0) {
      throw new AttachmentError(`"${name}" does not look like a text file.`);
    }
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const replacementCount = text.split("\uFFFD").length - 1;
  if (text.length > 0 && replacementCount / text.length > 0.02) {
    throw new AttachmentError(`"${name}" does not look like a text file.`);
  }

  return text;
}

function pageHasText(block: string) {
  return !block.endsWith("(no text on this page)");
}

async function extractPdf(name: string, bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      let laidPages: string[] = [];
      try {
        const items = await extractTextItems(pdf);
        laidPages = items.items.map((page) =>
          layoutPageItems(
            page.map((item) => ({
              fontSize: item.fontSize,
              hasEOL: item.hasEOL,
              height: item.height,
              str: item.str,
              width: item.width,
              x: item.x,
              y: item.y,
            }))
          )
        );
      } catch {
        laidPages = [];
      }

      const plain = await extractText(pdf, { mergePages: false });
      const plainPages = Array.isArray(plain.text) ? plain.text : [plain.text];
      const pageCount = Math.max(
        plain.totalPages,
        plainPages.length,
        laidPages.length
      );
      const parts: string[] = [];
      let used = 0;
      let stoppedAt = 0;

      for (let index = 0; index < pageCount; index += 1) {
        const body = choosePageText(
          laidPages[index] ?? "",
          plainPages[index] ?? ""
        );
        const block = `[Page ${index + 1}]\n${body || "(no text on this page)"}`;
        if (used > 0 && used + block.length > MAX_INDEXED_CHARS) {
          stoppedAt = index;
          break;
        }
        const fitted =
          block.length > MAX_INDEXED_CHARS
            ? block.slice(0, MAX_INDEXED_CHARS)
            : block;
        parts.push(fitted);
        used += fitted.length + 2;
        if (fitted.length !== block.length) {
          stoppedAt = index + 1;
          break;
        }
      }

      if (!parts.some(pageHasText)) {
        throw new AttachmentError(
          `No text could be read from "${name}". If this is a scanned PDF, it has no text layer the assistant can use.`
        );
      }

      let text = parts.join("\n\n");
      if (stoppedAt > 0 && stoppedAt < pageCount) {
        text += `\n\n[Indexing stopped after page ${parts.length} of ${pageCount}. Ask about a later page if you need it.]`;
      }
      return limitExtractedText(name, text);
    } finally {
      const cleanup = pdf as { destroy?: () => Promise<void> | void };
      if (typeof cleanup.destroy === "function") {
        await cleanup.destroy();
      }
    }
  } catch (error) {
    if (error instanceof AttachmentError) {
      throw error;
    }
    throw new AttachmentError(
      `Could not read "${name}". The PDF may be damaged, encrypted, or image-only.`,
      { cause: error }
    );
  }
}

async function extractDocx(name: string, bytes: Uint8Array) {
  try {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return limitExtractedText(name, result.value);
  } catch (error) {
    if (error instanceof AttachmentError) {
      throw error;
    }
    throw new AttachmentError(
      `Could not read "${name}". Save it as a .docx file and try again.`,
      { cause: error }
    );
  }
}

function extractJson(name: string, bytes: Uint8Array) {
  const text = decodePlainText(name, bytes);
  try {
    const parsed: unknown = JSON.parse(text);
    return limitExtractedText(name, JSON.stringify(parsed, null, 2));
  } catch (error) {
    throw new AttachmentError(`"${name}" is not valid JSON.`, { cause: error });
  }
}

export async function extractDocumentText({
  bytes,
  mediaType,
  name,
}: {
  bytes: Uint8Array;
  mediaType: DocumentMediaType;
  name: string;
}) {
  const cacheKey = `${mediaType}:${createHash("sha256").update(bytes).digest("hex")}`;
  const cached = extractedCache.get(cacheKey);
  if (cached) {
    rememberExtractedText(cacheKey, cached);
    return cached;
  }

  const text = await extractUncachedDocumentText({ bytes, mediaType, name });
  rememberExtractedText(cacheKey, text);
  return text;
}

async function extractUncachedDocumentText({
  bytes,
  mediaType,
  name,
}: {
  bytes: Uint8Array;
  mediaType: DocumentMediaType;
  name: string;
}) {
  switch (mediaType) {
    case "application/json":
      return extractJson(name, bytes);
    case "application/pdf":
      return await extractPdf(name, bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return await extractDocx(name, bytes);
    case "text/csv":
    case "text/markdown":
    case "text/plain":
      return limitExtractedText(name, decodePlainText(name, bytes));
    default:
      throw new AttachmentError(
        `Could not read "${name}". This file type is not supported.`
      );
  }
}
