export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_EXTRACTED_CHARS = 24_000;
export const MAX_EXTRACTED_CHARS_TOTAL = 48_000;
export const MAX_FILE_URL_LENGTH = 14_500_000;

export const IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export const DOCUMENT_MEDIA_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...IMAGE_MEDIA_TYPES,
  ...DOCUMENT_MEDIA_TYPES,
] as const;

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];
export type DocumentMediaType = (typeof DOCUMENT_MEDIA_TYPES)[number];
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];
export type AttachmentKind = "image" | "document";

export const UNSUPPORTED_FILE_MESSAGE =
  "This file type is not supported. Upload an image (PNG, JPEG, GIF, or WebP), a PDF, a Word document (.docx), or a text file (TXT, Markdown, CSV, or JSON).";

export const LEGACY_DOC_MESSAGE =
  "Older Word .doc files are not supported. Save the file as .docx and try again.";

export const EMPTY_FILE_MESSAGE = "This file is empty.";

export const TOO_MANY_FILES_MESSAGE = "You can attach up to 5 files at a time.";

export const IMAGE_NEEDS_VISION_MESSAGE =
  "This model cannot read images. Switch to a vision model, or upload a PDF, Word, or text file.";

export const FILE_TOO_LARGE_TO_SEND = "This file is too large to send.";

export const FILE_NAME_REQUIRED = "Choose a file that has a name.";

export const FILE_PICKER_HINT =
  "Attach PNG, JPEG, GIF, WebP, PDF, Word (.docx), TXT, Markdown, CSV, or JSON. Up to 5 files. Images up to 5 MB. Documents up to 10 MB.";

export const FILE_INPUT_ACCEPT = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".docx",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

const EXTENSION_MEDIA_TYPES: Record<string, AllowedMediaType> = {
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  markdown: "text/markdown",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  txt: "text/plain",
  webp: "image/webp",
};

const MIME_ALIASES: Record<string, AllowedMediaType> = {
  "application/csv": "text/csv",
  "application/json": "application/json",
  "application/markdown": "text/markdown",
  "application/pdf": "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif": "image/gif",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "text/csv": "text/csv",
  "text/markdown": "text/markdown",
  "text/plain": "text/plain",
  "text/x-csv": "text/csv",
  "text/x-markdown": "text/markdown",
};

const IMAGE_TYPE_SET = new Set<string>(IMAGE_MEDIA_TYPES);
const BASE64_WHITESPACE = /\s/g;

export class AttachmentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AttachmentError";
  }
}

export type ResolvedMediaType = {
  kind: AttachmentKind;
  mediaType: AllowedMediaType;
};

export type ResolvedAttachment = ResolvedMediaType & {
  name: string;
};

export function fileTooLargeMessage(kind: AttachmentKind) {
  if (kind === "image") {
    return "Images must be 5 MB or smaller.";
  }
  return "Documents must be 10 MB or smaller.";
}

export function displayFileName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return "attachment";
  }
  return trimmed.slice(0, 255);
}

export function attachmentDisplayName(part: {
  filename?: string;
  name?: string;
}) {
  return displayFileName(part.filename || part.name || "file");
}

export function fileKindLabel(mediaType: string, name: string) {
  const resolved = resolveMediaType(name || "file", mediaType);
  if ("error" in resolved) {
    return "File";
  }

  switch (resolved.mediaType) {
    case "application/json":
      return "JSON";
    case "application/pdf":
      return "PDF";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    case "image/gif":
      return "GIF";
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WEBP";
    case "text/csv":
      return "CSV";
    case "text/markdown":
      return "MD";
    case "text/plain":
      return "TXT";
    default:
      return "File";
  }
}

export function modelHasVision(
  modelId: string,
  capabilities?: Record<string, { vision?: boolean }>
) {
  const known = capabilities?.[modelId];
  if (known && typeof known.vision === "boolean") {
    return known.vision;
  }

  return /(?:^|[-_/])vl(?:[-_]|$)|vision/i.test(modelId);
}

function extensionOf(name: string) {
  const base = name.trim().toLowerCase().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return base.slice(dot + 1);
}

function normalizeMime(type: string) {
  return type.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function resolveMediaType(
  name: string,
  type: string
): ResolvedMediaType | { error: string } {
  const extension = extensionOf(name);
  if (extension === "doc" || normalizeMime(type) === "application/msword") {
    return { error: LEGACY_DOC_MESSAGE };
  }

  const fromExtension = EXTENSION_MEDIA_TYPES[extension];
  const fromMime = MIME_ALIASES[normalizeMime(type)];
  const mediaType = fromExtension ?? fromMime;

  if (!mediaType) {
    return { error: UNSUPPORTED_FILE_MESSAGE };
  }

  return {
    kind: IMAGE_TYPE_SET.has(mediaType) ? "image" : "document",
    mediaType,
  };
}

export function resolveAttachment(input: {
  name: string;
  size: number;
  type: string;
}): { attachment: ResolvedAttachment } | { error: string } {
  const media = resolveMediaType(input.name, input.type);
  if ("error" in media) {
    return media;
  }

  if (input.size <= 0) {
    return { error: EMPTY_FILE_MESSAGE };
  }

  const limit = media.kind === "image" ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (input.size > limit) {
    return { error: fileTooLargeMessage(media.kind) };
  }

  return {
    attachment: {
      ...media,
      name: displayFileName(input.name),
    },
  };
}

export function isVercelBlobUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

function bytesFromBase64(payload: string) {
  try {
    const binary = atob(payload.replace(BASE64_WHITESPACE, ""));
    const bytes = new Uint8Array(binary.length);
    let index = 0;
    for (const char of binary) {
      bytes[index] = char.charCodeAt(0);
      index += 1;
    }
    return bytes;
  } catch (error) {
    throw new AttachmentError("This file could not be read. Upload it again.", {
      cause: error,
    });
  }
}

function safeDecodeUri(payload: string) {
  try {
    return decodeURIComponent(payload);
  } catch (error) {
    throw new AttachmentError("This file could not be read. Upload it again.", {
      cause: error,
    });
  }
}

export function decodeDataUrl(url: string) {
  if (!url.startsWith("data:")) {
    throw new AttachmentError("This file could not be read. Upload it again.");
  }

  const comma = url.indexOf(",");
  if (comma < 0) {
    throw new AttachmentError("This file could not be read. Upload it again.");
  }

  const header = url.slice("data:".length, comma);
  const payload = url.slice(comma + 1);
  const segments = header
    .split(";")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  const isBase64 = segments.includes("base64");
  const bytes = isBase64
    ? bytesFromBase64(payload)
    : new TextEncoder().encode(safeDecodeUri(payload));

  if (payload.length > 0 && bytes.byteLength === 0) {
    throw new AttachmentError("This file could not be read. Upload it again.");
  }

  return bytes;
}

export function limitExtractedText(name: string, text: string) {
  const normalized = text
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .trim();
  if (!normalized) {
    throw new AttachmentError(
      `No text could be read from "${name}". If this is a scanned PDF, it has no text layer the assistant can use.`
    );
  }

  if (normalized.length <= MAX_EXTRACTED_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_EXTRACTED_CHARS)}\n\n[The extracted text was cut off after ${MAX_EXTRACTED_CHARS} characters.]`;
}

export function formatDocumentForModel(
  name: string,
  mediaType: string,
  text: string
) {
  return [
    `Attached file: ${name}`,
    `Type: ${mediaType}`,
    "The text below was extracted on the server. Treat it as the contents of that file.",
    "",
    text,
  ].join("\n");
}
