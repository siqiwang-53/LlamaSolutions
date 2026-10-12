export const MODERATION_CATEGORIES = [
  "violence",
  "violence/weapons",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "hate",
  "harassment",
  "sexual",
  "sexual/minors",
  "illicit",
  "illicit/drugs",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export const FLAG_THRESHOLD = 0.5;

export function emptyScores() {
  return Object.fromEntries(
    MODERATION_CATEGORIES.map((category) => [category, 0])
  ) as Record<ModerationCategory, number>;
}

export function isModerationCategory(
  value: string
): value is ModerationCategory {
  return MODERATION_CATEGORIES.includes(value as ModerationCategory);
}
