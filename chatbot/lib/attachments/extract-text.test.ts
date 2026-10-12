import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AttachmentError } from "@/lib/attachments";
import { extractDocumentText } from "@/lib/attachments/extract-text";

const HELLO_PDF = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMzAwIDE0NF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNTU+PnN0cmVhbQpCVCAvRjEgMTggVGYgNDAgODAgVGQgKEhlbGxvIFBERikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj5lbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTIgMDAwMDAgbiAKMDAwMDAwMDEwMSAwMDAwMCBuIAowMDAwMDAwMjExIDAwMDAwIG4gCjAwMDAwMDAyOTYgMDAwMDAgbiAKdHJhaWxlcjw8L1NpemUgNi9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM1NwolJUVPRgo=",
  "base64"
);

const HELLO_DOCX = Buffer.from(
  "UEsDBBQAAAAIANVTS12dxYoq8gAAALkBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH2QzU7DMBCE73kKy1eUOHBACCXpgZ8jcCgPsLI3iVV7bXnd0r49TgtFQpSjNfPNrKdb7b0TO0xsA/XyummlQNLBWJp6+b5+ru+k4AxkwAXCXh6Q5WqouvUhIosCE/dyzjneK8V6Rg/chIhUlDEkD7k806Qi6A1MqG7a9lbpQBkp13nJkEMlRPeII2xdFk/7opxuSehYioeTd6nrJcTorIZcdLUj86uo/ippCnn08GwjXxWDVJdKFvFyxw/6WiZK1qB4g5RfwBej+gjJKBP01he4+T/pj2vDOFqNZ35JiyloZC7be9ecFQ+Wvn/RqePwQ/UJUEsDBBQAAAAIANVTS11AoFMJsgAAAC8BAAALAAAAX3JlbHMvLnJlbHONz7sOgjAUBuCdp2jOLgUHYwyFxZiwGnyApj2URnpJWy+8vR0cxDg4ntt38jfd08zkjiFqZxnUZQUErXBSW8XgMpw2eyAxcSv57CwyWDBC1xbNGWee8k2ctI8kIzYymFLyB0qjmNDwWDqPNk9GFwxPuQyKei6uXCHdVtWOhk8D2oKQFUt6ySD0sgYyLB7/4d04aoFHJ24Gbfrx5WsjyzwoTAweLkgq3+0ys0BzSrqK2RYvUEsDBBQAAAAIANVTS12VK9HuqgAAAOYAAAARAAAAd29yZC9kb2N1bWVudC54bWw1jsEOwiAMhu97CsLdMT0Ys2zsZnwAjWeEbi6BlgA69/bCkl2+/G3Tr+2Gn7PsCyHOhD0/1g1ngJrMjFPPH/fr4cJZTAqNsoTQ8xUiH2TVLa0h/XGAiWUDxnbp+Tsl3woR9RucijV5wDwbKTiVchkmsVAwPpCGGPMBZ8Wpac7CqRm5rBjL1heZtcSt8DIjFCR5A2uJjYEce2ZLJ0qzMGz0277YBSXtD8rqD1BLAQIUAxQAAAAIANVTS12dxYoq8gAAALkBAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgA1VNLXUCgUwmyAAAALwEAAAsAAAAAAAAAAAAAAIABIwEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgA1VNLXZUr0e6qAAAA5gAAABEAAAAAAAAAAAAAAIAB/gEAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAADAAMAuQAAANcCAAAAAA==",
  "base64"
);

describe("extractDocumentText", () => {
  it("reads plain text, markdown, csv, and json", async () => {
    const text = await extractDocumentText({
      bytes: new TextEncoder().encode("hello text"),
      mediaType: "text/plain",
      name: "notes.txt",
    });
    assert.equal(text, "hello text");

    const markdown = await extractDocumentText({
      bytes: new TextEncoder().encode("# Title\n\nBody"),
      mediaType: "text/markdown",
      name: "notes.md",
    });
    assert.match(markdown, /# Title/);

    const csv = await extractDocumentText({
      bytes: new TextEncoder().encode("name,score\nAda,10"),
      mediaType: "text/csv",
      name: "scores.csv",
    });
    assert.match(csv, /Ada,10/);

    const json = await extractDocumentText({
      bytes: new TextEncoder().encode('{"city":"Dunedin"}'),
      mediaType: "application/json",
      name: "place.json",
    });
    assert.match(json, /"city": "Dunedin"/);
  });

  it("rejects invalid json and binary text", async () => {
    await assert.rejects(
      () =>
        extractDocumentText({
          bytes: new TextEncoder().encode("{not json"),
          mediaType: "application/json",
          name: "bad.json",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttachmentError);
        assert.match(error.message, /not valid JSON/);
        return true;
      }
    );

    await assert.rejects(
      () =>
        extractDocumentText({
          bytes: Uint8Array.from([104, 101, 0, 108]),
          mediaType: "text/plain",
          name: "binary.txt",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttachmentError);
        assert.match(error.message, /does not look like a text file/);
        return true;
      }
    );
  });

  it("extracts text from a pdf and a docx file", async () => {
    const pdf = await extractDocumentText({
      bytes: new Uint8Array(HELLO_PDF),
      mediaType: "application/pdf",
      name: "hello.pdf",
    });
    assert.match(pdf, /\[Page 1\]/);
    assert.match(pdf, /Hello PDF/);

    const docx = await extractDocumentText({
      bytes: new Uint8Array(HELLO_DOCX),
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "hello.docx",
    });
    assert.match(docx, /Hello from Word/);
  });

  it("explains when a pdf cannot be read", async () => {
    await assert.rejects(
      () =>
        extractDocumentText({
          bytes: new TextEncoder().encode("this is not a pdf"),
          mediaType: "application/pdf",
          name: "broken.pdf",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AttachmentError);
        assert.match(error.message, /Could not read "broken.pdf"/);
        return true;
      }
    );
  });
});
