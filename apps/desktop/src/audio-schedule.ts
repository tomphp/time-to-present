import type { ScriptWord } from "./session";

/** One Word's clip to sound: from Script Time `at`, its Recording from `from` to `until` in Recording Time. */
export interface Cue {
  word: string;
  recording: string;
  at: number;
  from: number;
  until: number;
}

export interface Clip {
  recording: string;
  from: number;
  until: number;
}

export interface ClockPosition {
  scriptTime: number;
  speed: number;
}

const LISTEN_CONTEXT_MS = 1_000;

/**
 * What a Preview sounds from the clock onwards. Each spoken Word's clip plays unstretched from
 * its Script Time, cut at the next Word's start (or Script End for the last), so it runs at the
 * speed of the audio while the clock runs at its own. A clock already inside a Word joins its
 * clip where it would be by now.
 */
export function audioSchedule(words: ScriptWord[], scriptEnd: number, { scriptTime, speed }: ClockPosition): Cue[] {
  return words.flatMap((word, index) => {
    const { id, recordingId, audioStart, audioEnd, start } = word;
    if (recordingId === null || audioStart === null || audioEnd === null) return [];
    const cut = words[index + 1]?.start ?? scriptEnd;
    const until = audioStart + Math.min(audioEnd - audioStart, (cut - start) / speed);
    const joined = Math.max(start, scriptTime);
    const from = audioStart + (joined - start) / speed;
    if (Math.round(from) >= Math.round(until)) return [];
    return [{ word: id, recording: recordingId, at: joined, from: Math.round(from), until: Math.round(until) }];
  });
}

/** What Listen plays: the Word's own Recording with a second either side, or nothing for a typed Word. */
export function listenClip({ recordingId, audioStart, audioEnd }: ScriptWord): Clip | null {
  if (recordingId === null || audioStart === null || audioEnd === null) return null;
  return {
    recording: recordingId,
    from: Math.max(0, audioStart - LISTEN_CONTEXT_MS),
    until: audioEnd + LISTEN_CONTEXT_MS,
  };
}

/** Where the clock stood on the audio clock (in seconds) when the Preview started or last changed course. */
export interface Anchor {
  audioTime: number;
  scriptTime: number;
  speed: number;
}

export interface CueTiming {
  when: number;
  offset: number;
  duration: number;
}

/**
 * When, on the audio clock, a fetched clip starts and how much of it plays: from the moment the
 * clock reaches the Cue, or now and part way in if it arrived late, or not at all if it is over.
 */
export function cueTiming(cue: Cue, anchor: Anchor, now: number): CueTiming | null {
  const due = anchor.audioTime + (cue.at - anchor.scriptTime) / anchor.speed / 1000;
  const late = Math.max(0, now - due);
  const duration = (cue.until - cue.from) / 1000 - late;
  return duration > 0 ? { when: due + late, offset: late, duration } : null;
}
