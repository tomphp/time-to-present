import type { ScriptWord } from "./session";

/** A stretch of one Recording, from `from` to `until` in Recording Time. */
export interface Clip {
  recording: string;
  from: number;
  until: number;
}

/** An Audio Run: from Script Time `start`, its Recording sounds unbroken from `from` until `until`. */
export type AudioRun = Clip & { start: number };

/**
 * A piece of an Audio Run, sounding from Script Time `at`; `key` names it whatever the clock's position.
 * It ramps in or out where its start or end is a cut, not a join with the piece beside it.
 */
export type Piece = Clip & { key: string; at: number; rampIn: boolean; rampOut: boolean };

export interface ClockPosition {
  scriptTime: number;
  speed: number;
}

const LISTEN_CONTEXT_MS = 1_000;

/** All of a spoken Word's own audio, or nothing for a typed Word. */
function spokenAudio({ recordingId, audioStart, audioEnd }: ScriptWord): Clip | null {
  if (recordingId === null || audioStart === null || audioEnd === null) return null;
  return { recording: recordingId, from: audioStart, until: audioEnd };
}

const ALIGNED_WITHIN_MS = 1;
const PIECE_MS = 2_000;

type SpokenWord = ScriptWord & Clip;
type RunWithWordStarts = AudioRun & { wordStarts: number[] };

function spokenWords(words: ScriptWord[]): (SpokenWord | null)[] {
  return words.map((word) => {
    const audio = spokenAudio(word);
    return audio && { ...word, ...audio };
  });
}

/** Whether a Word's audio follows on unbroken from the Run that starts with `first`. */
function followsOn(first: SpokenWord, word: SpokenWord, speed: number) {
  const drift = word.start - first.start - (word.from - first.from);
  return word.recording === first.recording && speed === 1 && Math.abs(drift) <= ALIGNED_WITHIN_MS;
}

function wordsByRun(words: ScriptWord[], speed: number): SpokenWord[][] {
  const runs: SpokenWord[][] = [];
  let current: SpokenWord[] | null = null;
  for (const word of spokenWords(words)) {
    if (word && current && followsOn(current[0], word, speed)) current.push(word);
    else if (word) runs.push((current = [word]));
    else current = null;
  }
  return runs;
}

function runCut(run: SpokenWord[], next: SpokenWord | undefined, scriptEnd: number, speed: number) {
  const first = run[0];
  const reachedAt = (scriptTime: number) => first.from + (scriptTime - first.start) / speed;
  const nextWouldSoundAgain = next && next.recording === first.recording && next.from > first.from;
  return Math.floor(
    Math.min(run[run.length - 1].until, nextWouldSoundAgain ? next.from : Infinity, reachedAt(next?.start ?? scriptEnd), reachedAt(scriptEnd)),
  );
}

function cutRuns(words: ScriptWord[], scriptEnd: number, speed: number): RunWithWordStarts[] {
  const runs = wordsByRun(words, speed);
  return runs.flatMap((run, index) => {
    const [{ recording, start, from }] = run;
    const until = runCut(run, runs[index + 1]?.[0], scriptEnd, speed);
    return until > from ? [{ recording, start, from, until, wordStarts: run.map((word) => word.from) }] : [];
  });
}

/**
 * The Audio Runs a Preview sounds at this speed. Below or above 1× each spoken Word is its own
 * Run. A Run is cut at the earliest of its last Word's audio end, the next spoken Word's audio
 * when that would sound it again, the next Run's start and Script End, reached at the clock's speed.
 */
export function audioRuns(words: ScriptWord[], scriptEnd: number, speed = 1): AudioRun[] {
  return cutRuns(words, scriptEnd, speed).map(({ wordStarts: _, ...run }) => run);
}

/** Where a Run is cut into pieces of about PIECE_MS, each at a Word's audio start, or a long Word on its own. */
function pieceEdges({ from, until, wordStarts }: RunWithWordStarts): number[] {
  const edges = [from];
  const lastEdge = () => edges[edges.length - 1];
  let previousCut = from;
  for (const cut of [...wordStarts.filter((start) => start > from && start < until), until]) {
    if (cut - lastEdge() > PIECE_MS && previousCut > lastEdge()) edges.push(previousCut);
    if (cut - lastEdge() > PIECE_MS) edges.push(cut);
    previousCut = cut;
  }
  if (lastEdge() !== until) edges.push(until);
  return edges;
}

/** Where in its Recording the sound has got by this clock position: in the Run sounding there, or the end of the last one. */
function soundReached(runs: RunWithWordStarts[], { scriptTime, speed }: ClockPosition) {
  const run = runs.filter((each) => each.start <= scriptTime).at(-1);
  return run && { recording: run.recording, reached: Math.min(run.until, run.from + (scriptTime - run.start) / speed) };
}

/**
 * What a Preview sounds from the clock onwards: its Audio Runs, in pieces to fetch and sound back
 * to back. A clock already inside a Run joins it where it would be by now, rounded up to a whole ms,
 * and never before where the sound had got at `heardSpeed`, the speed before a speed change.
 */
export function audioSchedule(words: ScriptWord[], scriptEnd: number, clock: ClockPosition, heardSpeed = clock.speed): Piece[] {
  const { scriptTime, speed } = clock;
  const heard = heardSpeed === speed ? undefined : soundReached(cutRuns(words, scriptEnd, heardSpeed), { scriptTime, speed: heardSpeed });
  return cutRuns(words, scriptEnd, speed).flatMap((run) => {
    const rejoinsHeard = heard?.recording === run.recording && run.start <= scriptTime;
    const joinAt = Math.ceil(Math.max(run.from + (scriptTime - run.start) / speed, rejoinsHeard ? heard.reached : -Infinity));
    const edges = pieceEdges(run);
    return edges.slice(0, -1).flatMap((edge, index) => {
      const from = Math.max(edge, joinAt);
      const until = edges[index + 1];
      if (from >= until) return [];
      const rampIn = from === run.from || from === joinAt;
      const rampOut = until === run.until;
      return [{ key: `${run.start}:${edge}`, recording: run.recording, at: run.start + (from - run.from) * speed, from, until, rampIn, rampOut }];
    });
  });
}

/** What Listen plays: the Word's own Recording with a second either side, or nothing for a typed Word. */
export function listenClip(word: ScriptWord): Clip | null {
  const audio = spokenAudio(word);
  return audio && { ...audio, from: Math.max(0, audio.from - LISTEN_CONTEXT_MS), until: audio.until + LISTEN_CONTEXT_MS };
}

/** What Listen would play: the first selected Word's clip, but nothing while the editor is locked. */
export function listenTarget(words: ScriptWord[], selected: string[], locked: boolean): Clip | null {
  const word = locked ? undefined : words.find((each) => each.id === selected[0]);
  return word ? listenClip(word) : null;
}

/** Where the clock stood on the audio clock (in seconds) when the Preview started or last changed course. */
export interface Anchor {
  audioTime: number;
  scriptTime: number;
  speed: number;
}

/** How long, in seconds, a gain ramp at a cut takes. */
export const RAMP_SECONDS = 0.005;

export interface PieceTiming {
  when: number;
  offset: number;
  duration: number;
}

/**
 * When, on the audio clock, a fetched piece starts and how much of it plays: from the moment the
 * clock reaches it, or now and part way in if it arrived late, or not at all if it is over.
 */
export function pieceTiming(piece: Piece, anchor: Anchor, now: number): PieceTiming | null {
  const due = anchor.audioTime + (piece.at - anchor.scriptTime) / anchor.speed / 1000;
  const late = Math.max(0, now - due);
  const duration = (piece.until - piece.from) / 1000 - late;
  return duration > 0 ? { when: due + late, offset: late, duration } : null;
}
