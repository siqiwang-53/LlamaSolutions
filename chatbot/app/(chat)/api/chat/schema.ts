import { z } from "zod";
import {
  FILE_NAME_REQUIRED,
  FILE_TOO_LARGE_TO_SEND,
  LEGACY_DOC_MESSAGE,
  MAX_FILE_URL_LENGTH,
  resolveMediaType,
  UNSUPPORTED_FILE_MESSAGE,
} from "@/lib/attachments";

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(["text"]),
});

const filePartSchema = z
  .object({
    filename: z.string().min(1).max(255).optional(),
    mediaType: z.string().min(1).max(200),
    name: z.string().min(1).max(255).optional(),
    type: z.literal("file"),
    url: z.string().min(1).max(MAX_FILE_URL_LENGTH, FILE_TOO_LARGE_TO_SEND),
  })
  .superRefine((part, ctx) => {
    const name = part.filename || part.name || "";
    if (!name.trim()) {
      ctx.addIssue({
        code: "custom",
        message: FILE_NAME_REQUIRED,
      });
      return;
    }

    const resolved = resolveMediaType(name, part.mediaType);
    if ("error" in resolved) {
      ctx.addIssue({
        code: "custom",
        message: resolved.error,
      });
    }
  });

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.uuid(),
  parts: z.array(partSchema),
  role: z.enum(["user"]),
});

const toolApprovalMessageSchema = z.object({
  id: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
  role: z.enum(["user", "assistant"]),
});

const friendlyBodyMessages = new Set([
  FILE_NAME_REQUIRED,
  FILE_TOO_LARGE_TO_SEND,
  LEGACY_DOC_MESSAGE,
  UNSUPPORTED_FILE_MESSAGE,
]);

export const postRequestBodySchema = z.object({
  id: z.uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(toolApprovalMessageSchema).optional(),
  persist: z.boolean().optional().default(true),
  selectedChatModel: z.string(),
  selectedVisibilityType: z.enum(["public", "private"]),
  webSearchEnabled: z.boolean().optional().default(true),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;

export function getFriendlyBodyError(error: unknown) {
  if (!(error instanceof z.ZodError)) {
    return null;
  }

  for (const issue of error.issues) {
    if (friendlyBodyMessages.has(issue.message)) {
      return issue.message;
    }
  }

  return null;
}
