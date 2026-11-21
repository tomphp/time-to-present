import type { ScriptWord } from "./session";

/** Below this, a transcribed Word is marked as one to check. */
export const LOW_CONFIDENCE = 0.7;

export interface LaidOutWord {
  id: string;
  text: string;
  lowConfidence: boolean;
}
export type Line = LaidOutWord[];
export type Paragraph = Line[];

export function scriptLayout(words: ScriptWord[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let paragraph: Paragraph = [];
  let line: Line = [];
  for (const { id, text, confidence, breakAfter } of words) {
    line.push({ id, text, lowConfidence: confidence !== null && confidence < LOW_CONFIDENCE });
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
