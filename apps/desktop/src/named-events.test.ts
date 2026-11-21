import { describe, expect, it } from "vitest";
import {
  chipsByAnchor,
  completeName,
  eventAnchorAt,
  eventEdit,
  eventNames,
  nextMoved,
  parseEventData,
  sameChips,
} from "./named-events";
import type { TimedEvent } from "./session";
import { scriptWord } from "./test-words";

const word = (id: string, text: string, duration = 300) => scriptWord(id, text, { duration });

const event = (id: string, name: string, anchor: string, time: number, offset = 0): TimedEvent => ({
  id,
  name,
  anchor,
  offset,
  time,
});

const words = [word("w1", "Hello,"), word("w2", "world.", 450)];

describe("eventAnchorAt", () => {
  it("anchors to the Script start when the caret is at the start", () => {
    expect(eventAnchorAt(words, { word: "w1", offset: 0 })).toEqual({ anchor: "scriptStart", offset: 0 });
    expect(eventAnchorAt(words, { slotAfter: null })).toEqual({ anchor: "scriptStart", offset: 0 });
    expect(eventAnchorAt([], { slotAfter: null })).toEqual({ anchor: "scriptStart", offset: 0 });
  });

  it("anchors to the Word the caret is before", () => {
    expect(eventAnchorAt(words, { word: "w2", offset: 0 })).toEqual({ anchor: "w2", offset: 0 });
  });

  it("anchors to the next Word when the caret is inside or after a Word", () => {
    expect(eventAnchorAt(words, { word: "w1", offset: 3 })).toEqual({ anchor: "w2", offset: 0 });
    expect(eventAnchorAt(words, { word: "w1", offset: 6 })).toEqual({ anchor: "w2", offset: 0 });
    expect(eventAnchorAt(words, { slotAfter: "w1" })).toEqual({ anchor: "w2", offset: 0 });
  });

  it("anchors to the last Word's end when no Word follows the caret", () => {
    expect(eventAnchorAt(words, { word: "w2", offset: 6 })).toEqual({ anchor: "w2", offset: 450 });
    expect(eventAnchorAt(words, { slotAfter: "w2" })).toEqual({ anchor: "w2", offset: 450 });
  });
});

describe("eventNames", () => {
  it("lists each name used once, alphabetically", () => {
    const events = [event("e1", "slide", "w1", 0), event("e2", "confetti", "w2", 10), event("e3", "slide", "w2", 20)];

    expect(eventNames(events)).toEqual(["confetti", "slide"]);
  });
});

describe("completeName", () => {
  const names = ["confetti", "slide", "slideshow"];

  it("completes to the first name that starts with what was typed", () => {
    expect(completeName(names, "sl")).toBe("slide");
    expect(completeName(names, "slides")).toBe("slideshow");
  });

  it("offers nothing for an empty name, an exact one or one nobody has used", () => {
    expect(completeName(names, "")).toBeNull();
    expect(completeName(names, "slide")).toBeNull();
    expect(completeName(names, "zoom")).toBeNull();
  });
});

describe("parseEventData", () => {
  it("takes blank data as none", () => {
    expect(parseEventData("  \n")).toEqual({ data: undefined });
  });

  it("accepts any JSON value", () => {
    expect(parseEventData('{"index": 2}')).toEqual({ data: { index: 2 } });
    expect(parseEventData("[1, 2]")).toEqual({ data: [1, 2] });
    expect(parseEventData('"intro"')).toEqual({ data: "intro" });
  });

  it("refuses text that is not JSON", () => {
    expect(parseEventData("{index: 2}")).toEqual({ error: expect.stringContaining("not valid JSON") });
  });
});

describe("nextMoved", () => {
  const events = [
    event("e1", "late", "w2", 900),
    event("e2", "early", "scriptStart", 0),
    event("e3", "middle", "w1", 400),
    event("e4", "unmoved", "w1", 500),
  ];
  const moved = ["e1", "e2", "e3"];

  it("starts from the earliest Moved event in Script Time", () => {
    expect(nextMoved(events, moved, null)).toBe("e2");
  });

  it("goes to the next Moved event after the selected one, wrapping round", () => {
    expect(nextMoved(events, moved, "e2")).toBe("e3");
    expect(nextMoved(events, moved, "e3")).toBe("e1");
    expect(nextMoved(events, moved, "e1")).toBe("e2");
  });

  it("goes to the next Moved event after a selected one without a badge", () => {
    expect(nextMoved(events, moved, "e4")).toBe("e1");
  });

  it("finds nothing when no event is Moved", () => {
    expect(nextMoved(events, [], null)).toBeNull();
  });
});

describe("chipsByAnchor", () => {
  it("groups events by their anchor in Script Time order", () => {
    const events = [
      event("e1", "b", "w1", 500, 100),
      event("e2", "a", "w1", 300, -100),
      event("e3", "intro", "scriptStart", 0),
    ];

    const chips = chipsByAnchor(events);

    expect(chips.get("w1")?.map((e) => e.id)).toEqual(["e2", "e1"]);
    expect(chips.get("scriptStart")?.map((e) => e.id)).toEqual(["e3"]);
  });
});

describe("sameChips", () => {
  const chips = (namedEvents: TimedEvent[], movedEvents: string[] = []) => ({ namedEvents, movedEvents });
  const events = [event("e1", "cue", "w1", 500), event("e2", "intro", "scriptStart", 0)];

  it("holds when only the events' Script Time has changed", () => {
    const moved = [event("e1", "cue", "w1", 900), event("e2", "intro", "scriptStart", 0)];

    expect(sameChips(chips(events), chips(moved))).toBe(true);
  });

  it("holds when events reach the same chips in another Script Time order", () => {
    const reordered = [event("e2", "intro", "scriptStart", 1000), event("e1", "cue", "w1", 0)];

    expect(sameChips(chips(events), chips(reordered))).toBe(true);
  });

  it("fails when a chip's name, anchor, order or Moved badge changes", () => {
    const [cue, intro] = events;

    expect(sameChips(chips(events), chips([event("e1", "fade", "w1", 500), intro]))).toBe(false);
    expect(sameChips(chips(events), chips([event("e1", "cue", "w2", 500), intro]))).toBe(false);
    expect(sameChips(chips([cue]), chips([cue, intro]))).toBe(false);
    expect(sameChips(chips(events), chips(events, ["e1"]))).toBe(false);
  });

  it("fails when events on one anchor swap places", () => {
    const pair = [event("e1", "a", "w1", 100), event("e3", "b", "w1", 200)];
    const swapped = [event("e1", "a", "w1", 300), event("e3", "b", "w1", 200)];

    expect(sameChips(chips(pair), chips(swapped))).toBe(false);
  });
});

describe("eventEdit", () => {
  const draft = { kind: "new", at: { anchor: "w2", offset: 0 } } as const;

  it("inserts a new event at its anchor with its trimmed name and data", () => {
    expect(eventEdit(draft, " slide ", '{"index": 2}')).toEqual({
      edit: { kind: "insertEvent", anchor: "w2", offset: 0, name: "slide", data: { index: 2 } },
    });
  });

  it("changes an existing event's name and data", () => {
    const existing = { kind: "existing", event: event("e1", "slide", "w1", 0) } as const;

    expect(eventEdit(existing, "zoom", "")).toEqual({
      edit: { kind: "setEvent", event: "e1", name: "zoom", data: undefined },
    });
  });

  it("refuses an event without a name", () => {
    expect(eventEdit(draft, "  ", "")).toEqual({ error: "A Named Event needs a name" });
  });

  it("refuses data that is not JSON", () => {
    expect(eventEdit(draft, "slide", "{")).toEqual({ error: expect.stringContaining("not valid JSON") });
  });
});
