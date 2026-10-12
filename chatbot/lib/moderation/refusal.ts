import type { ModerationCategory } from "@/lib/moderation/categories";

export const SELF_HARM_REFUSAL = `I'm really sorry you're dealing with this. I can't help with hurting yourself, but you don't have to handle it alone.

If you are in immediate danger, contact your local emergency number.

In New Zealand you can call or text 1737 anytime, or call Lifeline on 0800 543 354. Students can also talk with a counsellor at their school. In other countries, the International Association for Suicide Prevention lists local help: https://www.iasp.info/suicidalthoughts/

If you can, tell someone you trust how you feel.`;

export const MINORS_REFUSAL =
  "I can't help with sexual content involving minors.";

export const BLOCK_REFUSAL =
  "I can't help with that request. If you want, ask about your study notes, a document you uploaded, or another topic.";

export function refusalFor(categories: Record<ModerationCategory, boolean>) {
  if (categories["sexual/minors"]) {
    return MINORS_REFUSAL;
  }
  if (
    categories["self-harm"] ||
    categories["self-harm/intent"] ||
    categories["self-harm/instructions"]
  ) {
    return SELF_HARM_REFUSAL;
  }
  return BLOCK_REFUSAL;
}
