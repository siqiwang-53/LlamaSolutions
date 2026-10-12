import { DOCUMENT_CONTEXT_CHAR_BUDGET } from "@/lib/attachments";

const CHUNK_TARGET_CHARS = 1400;
const CHUNK_OVERLAP_CHARS = 160;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "me",
  "of",
  "on",
  "or",
  "please",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
]);

const OVERVIEW_QUERY =
  /\b(summar\w*|overview|outline|main points|tl;dr|entire|whole)\b/i;

export type TextChunk = {
  index: number;
  pageStart: number;
  pageEnd: number;
  text: string;
};

export type IndexedDocument = {
  mediaType: string;
  name: string;
  text: string;
};

type PageSlice = {
  page: number;
  text: string;
};

function splitPages(text: string): PageSlice[] {
  const matches = [...text.matchAll(/(?:^|\n\n)\[Page (\d+)\]\n/g)];
  if (matches.length === 0) {
    return [{ page: 1, text: text.trim() }];
  }

  return matches.flatMap((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const page = Number(match[1]);
    const body = text.slice(start, end).trim();
    if (!body || body === "(no text on this page)") {
      return [];
    }
    return [{ page, text: body }];
  });
}

function splitLong(text: string) {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + CHUNK_TARGET_CHARS);
    if (end < text.length) {
      const breakAt = text.lastIndexOf("\n", end);
      if (breakAt > start + CHUNK_TARGET_CHARS * 0.5) {
        end = breakAt;
      }
    }
    const piece = text.slice(start, end).trim();
    if (piece) {
      parts.push(piece);
    }
    if (end >= text.length) {
      break;
    }
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return parts;
}

export function chunkDocument(text: string): TextChunk[] {
  const pages = splitPages(text).filter((page) => page.text.length > 0);
  const chunks: TextChunk[] = [];
  let buffer: PageSlice[] = [];
  let bufferLength = 0;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    const body = buffer
      .map((page) => `[Page ${page.page}]\n${page.text}`)
      .join("\n\n");
    chunks.push({
      index: chunks.length,
      pageEnd: buffer.at(-1)?.page ?? buffer[0]?.page ?? 1,
      pageStart: buffer[0]?.page ?? 1,
      text: body,
    });
    buffer = [];
    bufferLength = 0;
  };

  for (const page of pages) {
    if (page.text.length > CHUNK_TARGET_CHARS) {
      flush();
      for (const piece of splitLong(page.text)) {
        chunks.push({
          index: chunks.length,
          pageEnd: page.page,
          pageStart: page.page,
          text: `[Page ${page.page}]\n${piece}`,
        });
      }
      continue;
    }

    if (
      bufferLength > 0 &&
      bufferLength + page.text.length > CHUNK_TARGET_CHARS
    ) {
      flush();
    }
    buffer.push(page);
    bufferLength += page.text.length;
  }
  flush();
  return chunks;
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function isOverviewQuery(query: string, queryTerms: string[]) {
  return OVERVIEW_QUERY.test(query) || queryTerms.length < 2;
}

function scoreChunks(chunks: TextChunk[], query: string) {
  const queryTerms = [...new Set(tokens(query))];
  const pageMentions = [...query.matchAll(/\bpage\s+(\d+)\b/gi)].map((match) =>
    Number(match[1])
  );
  const documentFrequency = new Map<string, number>();

  const chunkTerms = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    for (const term of tokens(chunk.text)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    for (const term of counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    return counts;
  });

  const total = chunks.length;
  return chunks.map((chunk, index) => {
    const counts = chunkTerms[index];
    let score = 0;
    if (counts) {
      for (const term of queryTerms) {
        const frequency = counts.get(term) ?? 0;
        if (frequency === 0) {
          continue;
        }
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log((total + 1) / (df + 0.5));
        score += (frequency / (frequency + 1.2)) * idf;
      }
    }

    if (queryTerms.length >= 2) {
      const phrase = queryTerms.slice(0, 6).join(" ");
      if (chunk.text.toLowerCase().includes(phrase)) {
        score += 1.5;
      }
    }

    if (
      pageMentions.some(
        (page) => page >= chunk.pageStart && page <= chunk.pageEnd
      )
    ) {
      score += 8;
    }

    return score;
  });
}

function takeWithinBudget(chunks: TextChunk[], budget: number) {
  const selected: TextChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (used >= budget) {
      break;
    }
    const room = budget - used;
    if (chunk.text.length <= room) {
      selected.push(chunk);
      used += chunk.text.length;
      continue;
    }
    if (selected.length === 0) {
      selected.push({
        ...chunk,
        text: `${chunk.text.slice(0, room).trim()}\n\n[This excerpt was cut to fit the model context.]`,
      });
    }
    break;
  }
  return selected;
}

export function selectRelevantChunks(
  chunks: TextChunk[],
  query: string,
  budget = DOCUMENT_CONTEXT_CHAR_BUDGET
) {
  if (chunks.length === 0) {
    return [];
  }

  const queryTerms = [...new Set(tokens(query))];
  if (isOverviewQuery(query, queryTerms)) {
    return takeWithinBudget(chunks, budget);
  }

  const scores = scoreChunks(chunks, query);
  const ranked = chunks
    .map((chunk, index) => ({ chunk, score: scores[index] ?? 0 }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.chunk.index - right.chunk.index
    );

  if (ranked.length === 0) {
    return takeWithinBudget(chunks, budget);
  }

  const picked = takeWithinBudget(
    ranked.map((item) => item.chunk),
    budget
  );
  return picked.sort((left, right) => left.index - right.index);
}

function pageCount(chunks: TextChunk[]) {
  return chunks.reduce((highest, chunk) => Math.max(highest, chunk.pageEnd), 0);
}

function formatPageList(chunks: TextChunk[]) {
  const pages = new Set<number>();
  for (const chunk of chunks) {
    for (let page = chunk.pageStart; page <= chunk.pageEnd; page += 1) {
      pages.add(page);
    }
  }
  return [...pages].sort((left, right) => left - right).join(", ");
}

function omissionNote(name: string, all: TextChunk[], selected: TextChunk[]) {
  if (selected.length === 0 || selected.length === all.length) {
    return null;
  }
  const multiPage = pageCount(all) > 1;
  const included = formatPageList(selected);
  if (multiPage) {
    return `[Note: "${name}" has ${pageCount(all)} pages. Only the most relevant excerpts were loaded (pages ${included}) because the full text does not fit this model's context. Ask about a page number or a topic to pull other parts.]`;
  }
  return `[Note: Only part of "${name}" was loaded because the full text does not fit this model's context. Ask about a more specific topic to pull other parts.]`;
}

export function buildDocumentContext(
  documents: IndexedDocument[],
  query: string,
  budget = DOCUMENT_CONTEXT_CHAR_BUDGET
) {
  const prepared = documents
    .map((document) => ({
      chunks: chunkDocument(document.text),
      document,
    }))
    .filter((item) => item.chunks.length > 0);

  if (prepared.length === 0) {
    return null;
  }

  const share = Math.max(800, Math.floor(budget / prepared.length));
  const blocks = prepared.map(({ chunks, document }) => {
    const selected = selectRelevantChunks(chunks, query, share);
    const note = omissionNote(document.name, chunks, selected);
    const full = selected.length === chunks.length;
    const lines = [
      `File: ${document.name}`,
      `Type: ${document.mediaType}`,
      full
        ? "The full extracted text is below."
        : "Relevant excerpts are below. Page markers show where the text came from.",
      "",
      selected.map((chunk) => chunk.text).join("\n\n"),
    ];
    if (note) {
      lines.push("", note);
    }
    return lines.join("\n");
  });

  return [
    "Documents loaded in this chat:",
    "Answer from the excerpts below. They stay available for follow-up questions. Do not invent pages or sections that were left out.",
    "",
    blocks.join("\n\n----\n\n"),
  ].join("\n");
}
