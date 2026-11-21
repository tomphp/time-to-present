import type { ScriptWord } from "./session";

export type LaidOutWord = Pick<ScriptWord, "id" | "text">;
export type Line = LaidOutWord[];
export type Paragraph = Line[];

export function scriptLayout(words: ScriptWord[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let paragraph: Paragraph = [];
  let line: Line = [];
  for (const { id, text, breakAfter } of words) {
    line.push({ id, text });
    if (breakAfter) {
      paragraph.push(line);
      line = [];
    }
    if (breakAfter === "paragraph") {
      paragraphs.push(paragraph);
      paragraph = [];
    }
  }
  if (line.length > 0) paragraph.push(line);
  if (paragraph.length > 0) paragraphs.push(paragraph);
  return paragraphs;
}
