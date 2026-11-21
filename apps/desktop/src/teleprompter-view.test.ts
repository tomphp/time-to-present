import { describe, expect, it } from "vitest";
import { eventsUpTo, rehearsal } from "./recorded-rehearsal";
import {
  currentWord,
  followClock,
  isPerformShortcut,
  keyCommand,
  scriptTimeAt,
  scrollTo,
  UNFOLLOWED,
  wordLook,
  type Scroll,
} from "./teleprompter-view";
import { scriptWord } from "./test-words";

const followedAt = (at: number) =>
  eventsUpTo(at).reduce((followed, entry) => followClock(followed, entry.event, entry.at), UNFOLLOWED);

const scriptTimeOfRehearsal = (at: number) => scriptTimeAt(followedAt(at), at);

describe("following the clock", () => {
  it("extrapolates Script Time between the Session's ticks while playing", () => {
    expect(scriptTimeOfRehearsal(0)).toBe(0);
    expect(scriptTimeOfRehearsal(1_450)).toBe(1_450);
    expect(scriptTimeOfRehearsal(1_475)).toBe(1_475);
  });

  it("never steps back when a tick says the Session is behind, and catches up from it", () => {
    const behind = followClock(followedAt(1_400), { type: "tick", scriptTime: 1_420 }, 1_450);

    expect(scriptTimeAt(behind, 1_450)).toBe(1_450);
    expect(scriptTimeAt(behind, 1_470)).toBe(1_450);
    expect(scriptTimeAt(behind, 1_500)).toBe(1_470);
  });

  it("holds still while paused and before play", () => {
    expect(scriptTimeOfRehearsal(2_600)).toBe(2_000);
    const ready = followClock(UNFOLLOWED, rehearsal.stream[0].event, 0);
    expect(scriptTimeAt(ready, 500)).toBe(0);
  });

  it("goes on from where a seek lands, and stops at the end", () => {
    expect(scriptTimeOfRehearsal(4_050)).toBe(4_800);
    expect(scriptTimeOfRehearsal(6_000)).toBe(5_850);
  });
});

const { words } = rehearsal.state;

const readingAt = (at: number) => {
  const followed = followedAt(at);
  const current = currentWord(words, followed.state, scriptTimeAt(followed, at));
  return current === null ? null : words[current].text;
};

describe("the current Word", () => {
  it("is none before play and in the Lead-in", () => {
    expect(currentWord(words, "ready", 0)).toBeNull();
    expect(readingAt(450)).toBeNull();
  });

  it("is each Word from its start until the next Word starts, with no sweep within it", () => {
    expect(readingAt(500)).toBe("Good");
    expect(readingAt(899)).toBe("Good");
    expect(readingAt(900)).toBe("morning,");
    expect(readingAt(2_600)).toBe("everyone.");
    expect(readingAt(3_500)).toBe("Today");
  });

  it("follows a seek, and stays on the last Word once the Performance ends", () => {
    expect(readingAt(4_000)).toBe("with");
    expect(readingAt(6_000)).toBe("teleprompter.");
  });

  it("is none in ready even with a Word at Script Time 0", () => {
    expect(currentWord([scriptWord("w1", "Now", { start: 0 })], "ready", 0)).toBeNull();
    expect(currentWord([scriptWord("w1", "Now", { start: 0 })], "playing", 0)).toBe(0);
  });
});

describe("how each Word looks", () => {
  it("dims the spoken Words before the current one and leaves the rest upcoming", () => {
    expect([0, 1, 2, 3].map((index) => wordLook(index, 2))).toEqual(["spoken", "spoken", "current", "upcoming"]);
    expect([0, 1].map((index) => wordLook(index, null))).toEqual(["upcoming", "upcoming"]);
  });
});

describe("scrolling", () => {
  /** The rehearsal laid out unwrapped: a line, a blank line for the paragraph break, then two lines. */
  const lineOf = [0, 0, 0, 2, 2, 2, 3, 3, 3];

  it("moves a line at a time with an ease as the Words cross lines, holds still between, and jumps on a seek", () => {
    const moves: Array<Scroll & { at: number }> = [];
    let scroll: Scroll | null = null;
    for (let at = 0; at <= 6_000; at += 50) {
      const followed = followedAt(at);
      const current = currentWord(words, followed.state, scriptTimeAt(followed, at));
      const next = scrollTo(scroll, lineOf[current ?? 0], followed.seeks);
      if (next !== scroll) moves.push({ at, ...next });
      scroll = next;
    }

    expect(moves).toEqual([
      { at: 0, line: 0, seeks: 1, animate: false },
      { at: 3_500, line: 2, seeks: 1, animate: true },
      { at: 4_000, line: 3, seeks: 2, animate: false },
    ]);
  });

  it("jumps when the Presentation closes and the next one's Snapshot arrives", () => {
    const playing = followedAt(3_600);
    const closed = followClock(playing, { type: "closed", reason: "closed" }, 3_600);
    const reopened = followClock(closed, rehearsal.stream[0].event, 3_700);

    expect(scrollTo({ line: 2, seeks: playing.seeks, animate: true }, 0, reopened.seeks).animate).toBe(false);
  });
});

describe("the keymap", () => {
  it("plays and pauses on Space, PageDown and →", () => {
    for (const key of [" ", "PageDown", "ArrowRight"]) {
      expect(keyCommand(key, "ready")).toBe("play");
      expect(keyCommand(key, "paused")).toBe("play");
      expect(keyCommand(key, "playing")).toBe("pause");
    }
  });

  it("does nothing once ended, before the first Snapshot, or on other keys", () => {
    expect(keyCommand(" ", "ended")).toBeNull();
    expect(keyCommand(" ", null)).toBeNull();
    expect(keyCommand("Enter", "paused")).toBeNull();
  });
});

describe("opening the Teleprompter", () => {
  it("is ⌘⇧P", () => {
    expect(isPerformShortcut({ key: "P", metaKey: true, shiftKey: true })).toBe(true);
    expect(isPerformShortcut({ key: "p", metaKey: true, shiftKey: false })).toBe(false);
    expect(isPerformShortcut({ key: "p", metaKey: false, shiftKey: true })).toBe(false);
  });
});
