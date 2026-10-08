/**
 * Safe, minimal formatting for assistant replies (pure; unit-tested). The
 * model writes plain text with short paragraphs and "-" lists; this turns
 * that into blocks the UI renders as React elements. No HTML is ever
 * interpreted — text stays text.
 *
 *   blank line         → new paragraph
 *   "- ", "* ", "• "   → bulleted list item
 *   "1. ", "1) "       → numbered list item
 *   **bold**           → emphasis (only when both markers are present)
 */

export type Inline = { text: string; strong?: boolean };
export type Block = { kind: "p"; lines: Inline[][] } | { kind: "ul" | "ol"; items: Inline[][] };

const BULLET = /^\s*(?:[-*•])\s+(.*)$/;
const NUMBER = /^\s*\d{1,2}[.)]\s+(.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*\n]+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1], strong: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text: "" }];
}

export function parseReply(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", lines: para.map(parseInline) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: list.kind, items: list.items.map(parseInline) });
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    if (bullet || number) {
      const kind = bullet ? "ul" : "ol";
      flushPara();
      if (list && list.kind !== kind) flushList();
      list ??= { kind, items: [] };
      list.items.push((bullet ?? number)![1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list) {
      // An indented continuation belongs to the last item; anything else ends the list.
      if (/^\s{2,}/.test(raw) && list.items.length) {
        list.items[list.items.length - 1] += ` ${line.trim()}`;
        continue;
      }
      flushList();
    }
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}
