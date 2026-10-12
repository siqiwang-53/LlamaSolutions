import {
  emptyScores,
  FLAG_THRESHOLD,
  isModerationCategory,
  MODERATION_CATEGORIES,
  type ModerationCategory,
} from "@/lib/moderation/categories";
import {
  type ClassifierScores,
  classifyWithModel,
} from "@/lib/moderation/classify";
import { scoreWithRules } from "@/lib/moderation/rules";

export type ModelMode = "always" | "auto" | "never";

export type ModerationClassifier = "rules" | "rules+model" | "rules-fallback";

export type ModerationResult = {
  categories: Record<ModerationCategory, boolean>;
  category_scores: Record<ModerationCategory, number>;
  classifier: ModerationClassifier;
  decision: "allow" | "block";
  flagged: boolean;
  model: string;
  reasons: string[];
};

export class ModerationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationInputError";
  }
}

function roundScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 10_000) / 10_000;
}

function maxScore(scores: Record<ModerationCategory, number>) {
  return Math.max(...Object.values(scores));
}

function mergeScores(
  rules: Record<ModerationCategory, number>,
  model: Partial<Record<ModerationCategory, number>> | null
) {
  const scores = emptyScores();
  for (const category of MODERATION_CATEGORIES) {
    const rule = rules[category] ?? 0;
    if (!model) {
      scores[category] = roundScore(rule);
      continue;
    }
    const llm = roundScore(model[category] ?? 0);
    const score =
      rule >= 0.85 ? Math.max(rule, llm) : Math.max(llm, rule * 0.5);
    scores[category] = roundScore(score);
  }
  return scores;
}

function applyCategoryFilter(
  scores: Record<ModerationCategory, number>,
  categories: readonly string[] | undefined
) {
  if (!categories) {
    return scores;
  }
  const allowed = new Set(categories);
  const next = emptyScores();
  for (const category of MODERATION_CATEGORIES) {
    if (allowed.has(category)) {
      next[category] = scores[category];
    }
  }
  return next;
}

export function assertModerationCategories(categories: string[] | undefined) {
  if (!categories) {
    return;
  }
  for (const category of categories) {
    if (!isModerationCategory(category)) {
      throw new ModerationInputError(
        `Unknown moderation category: ${category}`
      );
    }
  }
}

function toResult(
  scores: Record<ModerationCategory, number>,
  classifier: ModerationClassifier,
  model: string
): ModerationResult {
  const categories = emptyFlags();
  const reasons: string[] = [];
  for (const category of MODERATION_CATEGORIES) {
    const flagged = scores[category] >= FLAG_THRESHOLD;
    categories[category] = flagged;
    if (flagged) {
      reasons.push(`Flagged for ${category}`);
    }
  }
  const flagged = reasons.length > 0;
  return {
    categories,
    category_scores: scores,
    classifier,
    decision: flagged ? "block" : "allow",
    flagged,
    model,
    reasons,
  };
}

function emptyFlags() {
  return Object.fromEntries(
    MODERATION_CATEGORIES.map((category) => [category, false])
  ) as Record<ModerationCategory, boolean>;
}

export async function moderateText(
  input: string,
  options?: {
    categories?: readonly string[];
    classify?: (text: string) => Promise<ClassifierScores>;
    modelMode?: ModelMode;
    modelTimeoutMs?: number;
  }
): Promise<ModerationResult> {
  const text = input.trim();
  if (!text) {
    throw new ModerationInputError("Enter some text to check.");
  }

  const requested = options?.categories ? [...options.categories] : undefined;
  assertModerationCategories(requested);

  const rules = scoreWithRules(text);
  const mode = options?.modelMode ?? "auto";
  const peak = maxScore(rules);
  const shouldCallModel =
    mode === "always" || (mode === "auto" && peak >= 0.35 && peak < 0.85);

  let modelScores: ClassifierScores | null = null;
  let classifier: ModerationClassifier = "rules";
  if (shouldCallModel) {
    try {
      const classify =
        options?.classify ??
        ((value: string) =>
          classifyWithModel(value, options?.modelTimeoutMs ?? 8000));
      modelScores = await classify(text);
      classifier = "rules+model";
    } catch {
      classifier = "rules-fallback";
      modelScores = null;
    }
  }

  const merged = applyCategoryFilter(
    mergeScores(rules, modelScores?.scores ?? null),
    requested
  );
  return toResult(merged, classifier, modelScores?.model ?? "rules");
}
