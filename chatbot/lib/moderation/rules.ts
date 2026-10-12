import {
  emptyScores,
  type ModerationCategory,
} from "@/lib/moderation/categories";

type Rule = {
  also?: Partial<Record<ModerationCategory, number>>;
  category: ModerationCategory;
  pattern: RegExp;
  score: number;
};

/**
 * High-confidence phrases block even when the language model is down.
 * Single words stay under the block line so a history question is not
 * refused unless the model agrees.
 * Patterns detect requests. They do not describe how to cause harm.
 */
const RULES: Rule[] = [
  {
    also: { violence: 0.7 },
    category: "violence/weapons",
    pattern:
      /\b(how to|how do i|how can i|teach me to)\b.{0,48}\b(bomb|explosive|explosives|grenade)\b/i,
    score: 0.97,
  },
  {
    also: { violence: 0.7 },
    category: "violence/weapons",
    pattern:
      /\b(make|build|assemble|detonate)\b.{0,32}\b(a |an )?(bomb|explosive|grenade)\b/i,
    score: 0.96,
  },
  {
    also: { violence: 0.55 },
    category: "violence/weapons",
    pattern: /\b(pipe bomb|improvised explosive|molotov)\b/i,
    score: 0.92,
  },
  {
    category: "violence/weapons",
    pattern: /\b(bomb|explosive|grenade|weapon|firearms?)\b/i,
    score: 0.45,
  },
  {
    category: "violence",
    pattern:
      /\bhow to (kill|murder|stab|shoot)\s+(someone|him|her|them|people|a person)\b/i,
    score: 0.95,
  },
  {
    category: "violence",
    pattern:
      /\b(i will|i'm going to|im going to)\s+(kill|stab|shoot|murder)\b/i,
    score: 0.88,
  },
  {
    also: { "self-harm": 0.9, "self-harm/intent": 0.8 },
    category: "self-harm/instructions",
    pattern:
      /\bhow (do i|can i|to)\b.{0,48}\b(kill myself|hurt myself|commit suicide|end my life)\b/i,
    score: 0.97,
  },
  {
    also: { "self-harm": 0.9 },
    category: "self-harm/intent",
    pattern:
      /\bi (want|plan|am going) to (die|kill myself|end my life|hurt myself)\b/i,
    score: 0.93,
  },
  {
    also: { "self-harm/intent": 0.86 },
    category: "self-harm",
    pattern:
      /\b(kill myself|killing myself|end my life|suicide|self[- ]harm|hurt myself|cut myself)\b/i,
    score: 0.9,
  },
  {
    category: "hate",
    pattern:
      /\b(kill|exterminate|wipe out) all (jews|muslims|christians|blacks|whites|asians|immigrants|gays|trans people)\b/i,
    score: 0.96,
  },
  {
    category: "hate",
    pattern: /\b(nigger|faggot|kike|spic|chink|tranny)\b/i,
    score: 0.9,
  },
  {
    category: "harassment",
    pattern:
      /\b(i will|i'm going to|im going to)\s+(kill|hurt|attack|find)\s+you\b/i,
    score: 0.92,
  },
  {
    category: "harassment",
    pattern: /\b(kys|kill yourself)\b/i,
    score: 0.9,
  },
  {
    category: "sexual/minors",
    pattern: /\b(child porn|child pornography|csam|underage porn)\b/i,
    score: 1,
  },
  {
    category: "sexual",
    pattern: /\b(send nudes|explicit sex|sexual roleplay)\b/i,
    score: 0.8,
  },
  {
    category: "illicit",
    pattern:
      /\bhow to (hack into|phish|steal (a )?(password|credit card|money))\b/i,
    score: 0.9,
  },
  {
    also: { illicit: 0.7 },
    category: "illicit/drugs",
    pattern:
      /\bhow to (make|cook|synthesize|produce)\b.{0,40}\b(meth|heroin|fentanyl|cocaine)\b/i,
    score: 0.97,
  },
  {
    also: { illicit: 0.55 },
    category: "illicit/drugs",
    pattern: /\b(buy|sell|traffic)\b.{0,24}\b(meth|heroin|fentanyl|cocaine)\b/i,
    score: 0.86,
  },
  {
    category: "illicit/drugs",
    pattern: /\b(meth|heroin|fentanyl|cocaine)\b/i,
    score: 0.4,
  },
];

const MINOR_TERMS =
  /\b(child|children|kid|kids|minor|minors|underage|preteen|toddler)\b|\b([1-9]|1[0-7])\s*[- ]?years?\s*old\b/i;
const SEXUAL_TERMS = /\b(sex|sexual|porn|nude|nudes|naked)\b/i;

function raise(
  scores: Record<ModerationCategory, number>,
  category: ModerationCategory,
  score: number
) {
  scores[category] = Math.max(scores[category], score);
}

export function scoreWithRules(text: string) {
  const scores = emptyScores();
  for (const rule of RULES) {
    if (!rule.pattern.test(text)) {
      continue;
    }
    raise(scores, rule.category, rule.score);
    if (!rule.also) {
      continue;
    }
    for (const [category, score] of Object.entries(rule.also)) {
      raise(scores, category as ModerationCategory, score ?? 0);
    }
  }

  if (MINOR_TERMS.test(text) && SEXUAL_TERMS.test(text)) {
    raise(scores, "sexual/minors", 0.98);
    raise(scores, "sexual", 0.7);
  }

  return scores;
}
