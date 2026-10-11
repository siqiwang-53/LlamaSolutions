import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  AttachmentError,
  type DocumentMediaType,
  limitExtractedText,
} from "@/lib/attachments";

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

async function extractPdf(name: string, bytes: Uint8Array) {
  try {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text)
      ? result.text.join("\n\n")
      : result.text;
    return limitExtractedText(name, text);
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
