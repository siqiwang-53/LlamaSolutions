import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getFriendlyBodyError,
  postRequestBodySchema,
} from "@/app/(chat)/api/chat/schema";
import {
  AttachmentError,
  decodeDataUrl,
  EMPTY_FILE_MESSAGE,
  FILE_TOO_LARGE_TO_SEND,
  IMAGE_NEEDS_VISION_MESSAGE,
  isVercelBlobUrl,
  LEGACY_DOC_MESSAGE,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  modelHasVision,
  resolveAttachment,
  resolveMediaType,
  TOO_MANY_FILES_MESSAGE,
  UNSUPPORTED_FILE_MESSAGE,
} from "@/lib/attachments";
import { prepareMessagesForModel } from "@/lib/attachments/prepare-model-messages";
import type { ChatMessage } from "@/lib/types";

const chatId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function dataUrl(mediaType: string, text: string) {
  return `data:${mediaType};base64,${Buffer.from(text).toString("base64")}`;
}

describe("resolveMediaType", () => {
  it("accepts documents from the file extension when Windows sends a generic type", () => {
    assert.deepEqual(resolveMediaType("notes.md", ""), {
      kind: "document",
      mediaType: "text/markdown",
    });
    assert.deepEqual(
      resolveMediaType("sheet.csv", "application/vnd.ms-excel"),
      {
        kind: "document",
        mediaType: "text/csv",
      }
    );
    assert.deepEqual(
      resolveMediaType("photo.webp", "application/octet-stream"),
      {
        kind: "image",
        mediaType: "image/webp",
      }
    );
  });

  it("accepts jpeg, gif, and png images", () => {
    const jpeg = resolveMediaType("a.jpg", "image/jpeg");
    const gif = resolveMediaType("a.gif", "");
    assert.equal("kind" in jpeg && jpeg.kind, "image");
    assert.equal("mediaType" in gif && gif.mediaType, "image/gif");
  });

  it("rejects legacy Word files and unknown types", () => {
    assert.deepEqual(resolveMediaType("essay.doc", ""), {
      error: LEGACY_DOC_MESSAGE,
    });
    assert.deepEqual(
      resolveMediaType("script.exe", "application/octet-stream"),
      {
        error: UNSUPPORTED_FILE_MESSAGE,
      }
    );
  });
});

describe("resolveAttachment", () => {
  it("rejects empty and oversized files with English messages", () => {
    assert.deepEqual(
      resolveAttachment({ name: "notes.txt", size: 0, type: "text/plain" }),
      { error: EMPTY_FILE_MESSAGE }
    );
    const hugeImage = resolveAttachment({
      name: "huge.png",
      size: MAX_IMAGE_BYTES + 1,
      type: "image/png",
    });
    const hugeDocument = resolveAttachment({
      name: "huge.pdf",
      size: MAX_DOCUMENT_BYTES + 1,
      type: "application/pdf",
    });
    assert.equal(
      "error" in hugeImage && hugeImage.error,
      "Images must be 5 MB or smaller."
    );
    assert.equal(
      "error" in hugeDocument && hugeDocument.error,
      "Documents must be 10 MB or smaller."
    );
  });
});

describe("modelHasVision", () => {
  it("uses the known capability table first", () => {
    assert.equal(
      modelHasVision("openai/gpt-oss-20b", {
        "openai/gpt-oss-20b": { vision: false },
      }),
      false
    );
    assert.equal(
      modelHasVision("qwen/qwen3-vl-4b", {
        "qwen/qwen3-vl-4b": { vision: true },
      }),
      true
    );
  });

  it("treats unlisted VL model ids as vision models", () => {
    assert.equal(modelHasVision("qwen2.5-vl-7b-instruct", {}), true);
    assert.equal(modelHasVision("openai/gpt-oss-20b-local", {}), false);
  });
});

describe("decodeDataUrl", () => {
  it("round-trips plain text", () => {
    const bytes = decodeDataUrl(dataUrl("text/plain", "hello file"));
    assert.equal(new TextDecoder().decode(bytes), "hello file");
  });

  it("rejects a normal web address", () => {
    assert.equal(isVercelBlobUrl("http://127.0.0.1/secret.pdf"), false);
    assert.equal(
      isVercelBlobUrl("https://abc.public.blob.vercel-storage.com/notes.txt"),
      true
    );
  });
});

describe("prepareMessagesForModel", () => {
  it("replaces a text file with extracted text and leaves the question", async () => {
    const messages = [
      {
        id: chatId,
        parts: [
          {
            filename: "notes.txt",
            mediaType: "text/plain",
            type: "file",
            url: dataUrl("text/plain", "Quarterly revenue was 42."),
          },
          { text: "Summarize this.", type: "text" },
        ],
        role: "user",
      },
    ] as ChatMessage[];

    const prepared = await prepareMessagesForModel(messages, {
      latestUserMessageId: chatId,
      supportsVision: false,
    });
    const [fileText, question] = prepared[0]?.parts ?? [];
    assert.equal(fileText?.type, "text");
    assert.match(
      fileText && "text" in fileText ? fileText.text : "",
      /Quarterly revenue was 42/
    );
    assert.deepEqual(question, { text: "Summarize this.", type: "text" });
  });

  it("keeps images for vision models and blocks them otherwise", async () => {
    const messages = [
      {
        id: chatId,
        parts: [
          {
            filename: "cat.png",
            mediaType: "image/png",
            type: "file",
            url: dataUrl("image/png", "not-really-a-png"),
          },
          { text: "What is this?", type: "text" },
        ],
        role: "user",
      },
    ] as ChatMessage[];

    const visible = await prepareMessagesForModel(messages, {
      latestUserMessageId: chatId,
      supportsVision: true,
    });
    assert.equal(visible[0]?.parts[0]?.type, "file");

    await assert.rejects(
      () =>
        prepareMessagesForModel(messages, {
          latestUserMessageId: chatId,
          supportsVision: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttachmentError);
        assert.equal(error.message, IMAGE_NEEDS_VISION_MESSAGE);
        return true;
      }
    );
  });

  it("rejects more than five files", async () => {
    const parts = Array.from({ length: 6 }, (_, index) => ({
      filename: `note-${index}.txt`,
      mediaType: "text/plain",
      type: "file" as const,
      url: dataUrl("text/plain", `note ${index}`),
    }));
    const messages = [
      {
        id: chatId,
        parts: [...parts, { text: "Read these.", type: "text" }],
        role: "user",
      },
    ] as ChatMessage[];

    await assert.rejects(
      () =>
        prepareMessagesForModel(messages, {
          latestUserMessageId: chatId,
          supportsVision: false,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttachmentError);
        assert.equal(error.message, TOO_MANY_FILES_MESSAGE);
        return true;
      }
    );
  });
});

describe("postRequestBodySchema", () => {
  it("defaults web search to on and accepts a pdf part", () => {
    const parsed = postRequestBodySchema.parse({
      id: chatId,
      message: {
        id: chatId,
        parts: [
          {
            filename: "brief.pdf",
            mediaType: "application/pdf",
            type: "file",
            url: "https://example.public.blob.vercel-storage.com/brief.pdf",
          },
          { text: "Summarize the PDF.", type: "text" },
        ],
        role: "user",
      },
      selectedChatModel: "openai/gpt-4o",
      selectedVisibilityType: "private",
    });

    assert.equal(parsed.webSearchEnabled, true);
  });

  it("keeps an explicit web search off flag", () => {
    const parsed = postRequestBodySchema.parse({
      id: chatId,
      selectedChatModel: "qwen/qwen3-vl-4b",
      selectedVisibilityType: "private",
      webSearchEnabled: false,
    });
    assert.equal(parsed.webSearchEnabled, false);
  });

  it("returns a clear error for an unsupported file", () => {
    const result = postRequestBodySchema.safeParse({
      id: chatId,
      message: {
        id: chatId,
        parts: [
          {
            filename: "virus.exe",
            mediaType: "application/octet-stream",
            type: "file",
            url: "data:application/octet-stream;base64,YQ==",
          },
          { text: "Open this.", type: "text" },
        ],
        role: "user",
      },
      selectedChatModel: "openai/gpt-4o",
      selectedVisibilityType: "private",
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(
        getFriendlyBodyError(result.error),
        UNSUPPORTED_FILE_MESSAGE
      );
    }
  });

  it("returns a clear error when the file url is too long", () => {
    const result = postRequestBodySchema.safeParse({
      id: chatId,
      message: {
        id: chatId,
        parts: [
          {
            filename: "big.txt",
            mediaType: "text/plain",
            type: "file",
            url: `data:text/plain;base64,${"a".repeat(15_000_000)}`,
          },
          { text: "Read this.", type: "text" },
        ],
        role: "user",
      },
      selectedChatModel: "openai/gpt-4o",
      selectedVisibilityType: "private",
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(getFriendlyBodyError(result.error), FILE_TOO_LARGE_TO_SEND);
    }
  });
});
