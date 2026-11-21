import type { ScriptWord } from "./session";

/** A stretch of one Recording, from `from` to `until` in Recording Time. */
export interface Clip {
  recording: string;
  from: number;
  until: number;
}

/** One Word's clip, sounding from Script Time `at`. */
export type ScheduledClip = Clip & { word: string; at: number };

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

/**
 * What a Preview sounds from the clock onwards. Each spoken Word's clip plays unstretched from
 * its Script Time, cut at the next Word's start (or Script End for the last), so it runs at the
 * speed of the audio while the clock runs at its own. A clock already inside a Word joins its
 * clip where it would be by now.
 */
export function audioSchedule(words: ScriptWord[], scriptEnd: number, { scriptTime, speed }: ClockPosition): ScheduledClip[] {
  return words.flatMap((word, index) => {
    const audio = spokenAudio(word);
    if (!audio) return [];
    const cut = words[index + 1]?.start ?? scriptEnd;
    const until = audio.from + Math.min(audio.until - audio.from, (cut - word.start) / speed);
    const at = Math.max(word.start, scriptTime);
    const from = audio.from + (at - word.start) / speed;
    if (Math.round(from) >= Math.round(until)) return [];
    return [{ word: word.id, recording: audio.recording, at, from: Math.round(from), until: Math.round(until) }];
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

export interface ClipTiming {
  when: number;
  offset: number;
  duration: number;
}

/**
 * When, on the audio clock, a fetched clip starts and how much of it plays: from the moment the
 * clock reaches it, or now and part way in if it arrived late, or not at all if it is over.
 */
export function clipTiming(clip: ScheduledClip, anchor: Anchor, now: number): ClipTiming | null {
  const due = anchor.audioTime + (clip.at - anchor.scriptTime) / anchor.speed / 1000;
  const late = Math.max(0, now - due);
  const duration = (clip.until - clip.from) / 1000 - late;
  return duration > 0 ? { when: due + late, offset: late, duration } : null;
}
