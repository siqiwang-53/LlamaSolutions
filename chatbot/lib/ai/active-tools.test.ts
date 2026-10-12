import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildActiveToolNames,
  includesCoreTools,
  includesSearchTools,
} from "@/lib/ai/active-tools";

describe("buildActiveToolNames", () => {
  it("includes web search and news tools when search is on", () => {
    const names = buildActiveToolNames({
      isReasoningModel: false,
      supportsTools: true,
      webSearchEnabled: true,
    });
    assert.equal(includesSearchTools(names), true);
    assert.equal(includesCoreTools(names), true);
  });

  it("omits web search and news tools when search is off", () => {
    const names = buildActiveToolNames({
      isReasoningModel: true,
      supportsTools: true,
      webSearchEnabled: false,
    });
    assert.equal(includesSearchTools(names), false);
    assert.equal(names.includes("webSearch"), false);
    assert.equal(names.includes("searchNews"), false);
    assert.equal(includesCoreTools(names), true);
  });

  it("gives a reasoning model with no tools an empty list", () => {
    const names = buildActiveToolNames({
      isReasoningModel: true,
      supportsTools: false,
      webSearchEnabled: true,
    });
    assert.deepEqual(names, []);
  });
});
