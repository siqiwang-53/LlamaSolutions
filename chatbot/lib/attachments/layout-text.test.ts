import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { choosePageText, layoutPageItems } from "@/lib/attachments/layout-text";

describe("layoutPageItems", () => {
  it("keeps a simple table as spaced columns", () => {
    const text = layoutPageItems([
      {
        fontSize: 12,
        height: 12,
        str: "Course",
        width: 48,
        x: 40,
        y: 700,
      },
      {
        fontSize: 12,
        height: 12,
        str: "Credits",
        width: 56,
        x: 220,
        y: 700,
      },
      {
        fontSize: 12,
        height: 12,
        str: "Math",
        width: 32,
        x: 40,
        y: 680,
      },
      {
        fontSize: 12,
        height: 12,
        str: "15",
        width: 16,
        x: 220,
        y: 680,
      },
    ]);

    const [header, row] = text.split("\n");
    assert.match(header ?? "", /Course {2,}Credits/);
    assert.match(row ?? "", /Math {2,}15/);
  });
});

describe("choosePageText", () => {
  it("prefers positioned text when it is nearly as long as the plain extract", () => {
    assert.equal(
      choosePageText("Course  Credits", "Course Credits"),
      "Course  Credits"
    );
    assert.equal(
      choosePageText("short", "a much longer plain extract"),
      "a much longer plain extract"
    );
  });
});
