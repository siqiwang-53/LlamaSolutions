export type LayoutItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  hasEOL?: boolean;
};

function lineTolerance(left: LayoutItem, right: LayoutItem) {
  const size = Math.max(left.fontSize, right.fontSize, 8);
  return size * 0.45;
}

function renderLine(line: LayoutItem[]) {
  const ordered = [...line].sort((left, right) => left.x - right.x);
  let text = "";
  let cursor = 0;

  for (const item of ordered) {
    const size = item.fontSize > 0 ? item.fontSize : 12;
    const space = Math.max(size * 0.33, 2);
    if (text) {
      const gap = item.x - cursor;
      if (gap > space * 1.6) {
        const count = Math.min(8, Math.max(2, Math.round(gap / space)));
        text += " ".repeat(count);
      } else if (
        gap > space * 0.35 &&
        !text.endsWith(" ") &&
        !item.str.startsWith(" ")
      ) {
        text += " ";
      }
    }

    text += item.str;
    const width = item.width > 0 ? item.width : item.str.length * space;
    cursor = item.x + width;
  }

  return text.replace(/[ \t]+$/g, "");
}

/** Rebuild lines from PDF text positions so simple tables keep their columns. */
export function layoutPageItems(items: LayoutItem[]) {
  const visible = items.filter((item) => item.str.length > 0);
  if (visible.length === 0) {
    return "";
  }

  const sorted = [...visible].sort(
    (left, right) => right.y - left.y || left.x - right.x
  );
  const lines: LayoutItem[][] = [];

  for (const item of sorted) {
    const current = lines.at(-1);
    const anchor = current?.[0];
    if (
      !current ||
      !anchor ||
      Math.abs(anchor.y - item.y) > lineTolerance(anchor, item)
    ) {
      lines.push([item]);
      continue;
    }
    current.push(item);
  }

  return lines
    .map((line) => renderLine(line))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function choosePageText(laidOut: string, plain: string) {
  const laid = laidOut.trim();
  const fallback = plain.trim();
  if (!laid) {
    return fallback;
  }
  if (!fallback) {
    return laid;
  }
  if (laid.length >= fallback.length * 0.6) {
    return laid;
  }
  return fallback;
}
