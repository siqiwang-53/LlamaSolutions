import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStoredWebSearchFlag } from "@/lib/web-search-preference";

describe("parseStoredWebSearchFlag", () => {
  it("defaults to on", () => {
    assert.equal(parseStoredWebSearchFlag(null), true);
    assert.equal(parseStoredWebSearchFlag(""), true);
    assert.equal(parseStoredWebSearchFlag("true"), true);
  });

  it("stays off only for a stored false value", () => {
    assert.equal(parseStoredWebSearchFlag("false"), false);
    assert.equal(parseStoredWebSearchFlag('"false"'), true);
    assert.equal(parseStoredWebSearchFlag("not-json"), true);
  });
});
