import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDocumentContext,
  chunkDocument,
  selectRelevantChunks,
} from "@/lib/attachments/document-context";

function handbook() {
  const padding = `${"Parking rules apply across campus. ".repeat(80)}`;
  return [
    "[Page 1]",
    "Cafeteria lunch is served at noon.",
    "",
    "[Page 2]",
    padding,
    "",
    "[Page 8]",
    "Library hours are Monday to Friday, 8am to 6pm.",
  ].join("\n");
}

describe("selectRelevantChunks", () => {
  it("picks the page that matches the question when the file is long", () => {
    const chunks = chunkDocument(handbook());
    const selected = selectRelevantChunks(
      chunks,
      "What are the library hours?",
      500
    );
    const text = selected.map((chunk) => chunk.text).join("\n");
    assert.match(text, /\[Page 8\]/);
    assert.match(text, /8am to 6pm/);
    assert.doesNotMatch(text, /Cafeteria/);
  });

  it("starts at the beginning for a summary request", () => {
    const chunks = chunkDocument(handbook());
    const selected = selectRelevantChunks(
      chunks,
      "Please summarize this document",
      80
    );
    const text = selected.map((chunk) => chunk.text).join("\n");
    assert.match(text, /Cafeteria/);
    assert.doesNotMatch(text, /8am to 6pm/);
  });

  it("tells the caller when later pages were left out", () => {
    const context = buildDocumentContext(
      [
        {
          mediaType: "application/pdf",
          name: "handbook.pdf",
          text: handbook(),
        },
      ],
      "What are the library hours?",
      500
    );
    assert.match(context ?? "", /handbook.pdf/);
    assert.match(context ?? "", /8am to 6pm/);
    assert.match(context ?? "", /left out|Only the most relevant excerpts/i);
  });
});
