import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";

const hints: RequestHints = {
  city: "Dunedin",
  country: "New Zealand",
  latitude: "-45.87",
  longitude: "170.50",
};

describe("systemPrompt web search", () => {
  it("tells the model to search when web search is on", () => {
    const prompt = systemPrompt({
      requestHints: hints,
      supportsTools: true,
      webSearchEnabled: true,
    });
    assert.match(prompt, /→ call searchNews/);
    assert.match(prompt, /Attached files/);
  });

  it("tells the model not to search when web search is off", () => {
    const prompt = systemPrompt({
      requestHints: hints,
      supportsTools: true,
      webSearchEnabled: false,
    });
    assert.match(prompt, /Web search is turned off/);
    assert.doesNotMatch(prompt, /→ call searchNews/);
    assert.match(prompt, /getWeather/);
  });

  it("skips search instructions when the model cannot use tools", () => {
    const prompt = systemPrompt({
      requestHints: hints,
      supportsTools: false,
      webSearchEnabled: true,
    });
    assert.doesNotMatch(prompt, /call searchNews/);
    assert.match(prompt, /extracted text/);
  });
});
