import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { isModerationAuthorized } from "@/lib/moderation/auth";
import {
  ModerationInputError,
  type ModerationResult,
  moderateText,
} from "@/lib/moderation/moderate";

export const maxDuration = 30;

const UNAUTHORIZED_MESSAGE =
  "Sign in, or set MODERATION_API_KEY and send Authorization: Bearer or the x-moderation-key header.";

const bodySchema = z.object({
  categories: z.array(z.string().min(1).max(64)).max(20).optional(),
  input: z.union([
    z.string().min(1).max(8000),
    z.array(z.string().min(1).max(8000)).min(1).max(8),
  ]),
  useModel: z.boolean().optional(),
});

function publicResult(result: ModerationResult) {
  return {
    categories: result.categories,
    category_scores: result.category_scores,
    classifier: result.classifier,
    decision: result.decision,
    flagged: result.flagged,
    reasons: result.reasons,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  const allowed = isModerationAuthorized({
    authorizationHeader: request.headers.get("authorization"),
    configuredKey: process.env.MODERATION_API_KEY,
    hasSession: Boolean(session?.user),
    moderationKeyHeader: request.headers.get("x-moderation-key"),
  });

  if (!allowed) {
    return NextResponse.json({ error: UNAUTHORIZED_MESSAGE }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a JSON body with an input string." },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Body must be { input: string or string[], categories?: string[], useModel?: boolean }.",
      },
      { status: 400 }
    );
  }

  const inputs = Array.isArray(parsed.data.input)
    ? parsed.data.input
    : [parsed.data.input];
  const modelMode = parsed.data.useModel === false ? "never" : "always";

  try {
    const results: ModerationResult[] = [];
    for (const input of inputs) {
      // biome-ignore lint/performance/noAwaitInLoops: one moderation model call at a time
      const result = await moderateText(input, {
        categories: parsed.data.categories,
        modelMode,
        modelTimeoutMs: 8000,
      });
      results.push(result);
    }

    return NextResponse.json({
      id: `modr_${nanoid(16)}`,
      model: results[0]?.model ?? "rules",
      results: results.map(publicResult),
    });
  } catch (error) {
    if (error instanceof ModerationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Moderation request failed:", error);
    return NextResponse.json(
      { error: "Moderation could not be completed. Try again." },
      { status: 500 }
    );
  }
}
