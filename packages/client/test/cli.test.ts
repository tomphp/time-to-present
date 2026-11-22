import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PresentationScript } from "../src/presentation-script";
import { ttp } from "../src/ttp";

const fixture = (name: string) => fileURLToPath(new URL(`../../../crates/core/tests/fixtures/${name}`, import.meta.url));

function run(args: string[], cwd: string) {
  let out = "";
  let err = "";
  const code = ttp(args, { cwd, out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

const succeeds = (out: string) => ({ code: 0, out, err: "" });

function presentationFolder(contents: string | object) {
  const folder = mkdtempSync(join(tmpdir(), "ttp-"));
  writeFileSync(join(folder, "presentation.json"), typeof contents === "string" ? contents : JSON.stringify(contents));
  return folder;
}

const word = (id: string, text: string, gap = 100, duration = 200) => ({ id, text, gap, duration });
const presentation = (script: Partial<PresentationScript>) =>
  presentationFolder({ formatVersion: 1, title: "Test", recordings: [], words: [], namedEvents: [], ...script });

describe("ttp against the core's fixture Presentations", () => {
  it("prints the rehearsal's Script Text with its line and paragraph breaks", () => {
    expect(run(["text"], fixture("rehearsal"))).toEqual(
      succeeds("Good morning, everyone.\n\nToday we rehearse\nwith a teleprompter.\n"),
    );
  });

  it("marks the rehearsal's Named Events in its Script Text", () => {
    expect(run(["text", "--events"], fixture("rehearsal"))).toEqual(
      succeeds('[slide {"index":1}] Good morning, everyone.\n\n[slide {"index":2}] Today we rehearse\nwith a teleprompter.\n'),
    );
  });

  it("lists the rehearsal's Named Events", () => {
    expect(run(["events"], fixture("rehearsal"))).toEqual(
      succeeds('0:00.000  slide  {"index":1}  at start\n0:02.500  slide  {"index":2}  at "Today"\n'),
    );
  });

  it("prints the rehearsal's Named Events in the NamedEvent shape", () => {
    const { code, out, err } = run(["events", "--json"], fixture("rehearsal"));
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(out.endsWith("]\n")).toBe(true);
    expect(JSON.parse(out)).toEqual([
      { id: "e1", name: "slide", data: { index: 1 }, scriptTime: 0 },
      { id: "e2", name: "slide", data: { index: 2 }, scriptTime: 2500 },
    ]);
  });

  it("reads hello-world, leaving out an event's data when it has none", () => {
    expect(run(["text"], fixture("hello-world"))).toEqual(succeeds("Hello, world.\n\nTyped\n"));
    expect(run(["events"], fixture("hello-world"))).toEqual(
      succeeds('0:00.000  slide  {"index":1}  at start\n0:02.200  confetti  at "Typed"\n'),
    );
  });

  it("reads spoken-only, showing an event before Script Time 0 at 0", () => {
    expect(run(["text"], fixture("spoken-only"))).toEqual(succeeds("Just words.\n"));
    expect(run(["events"], fixture("spoken-only"))).toEqual(succeeds('0:00.000  intro  at "Just"\n'));
  });

  it("reads an older format version", () => {
    expect(run(["text"], fixture("before-titles"))).toEqual(succeeds("Hi.\n"));
  });

  it("refuses a newer format version, saying to update the Client", () => {
    expect(run(["text"], fixture("from-the-future"))).toEqual({
      code: 1,
      out: "",
      err: "ttp: presentation.json is format 2; this ttp reads up to 1: update @time-to-present/client\n",
    });
  });
});

describe("finding presentation.json", () => {
  const hello = () => presentation({ words: [word("w1", "Hello.")] });

  it("searches up from a nested app-src/", () => {
    const appSrc = join(hello(), "app-src", "src");
    mkdirSync(appSrc, { recursive: true });
    expect(run(["text"], appSrc)).toEqual(succeeds("Hello.\n"));
  });

  it("takes a Presentation folder", () => {
    expect(run(["text", hello()], tmpdir())).toEqual(succeeds("Hello.\n"));
  });

  it("takes a presentation.json path", () => {
    expect(run(["text", join(hello(), "presentation.json")], tmpdir())).toEqual(succeeds("Hello.\n"));
  });

  it("takes a path relative to the current folder", () => {
    const folder = hello();
    mkdirSync(join(folder, "app-src"));
    expect(run(["text", ".."], join(folder, "app-src"))).toEqual(succeeds("Hello.\n"));
  });

  it("names the folder it started from when it finds nothing", () => {
    const empty = mkdtempSync(join(tmpdir(), "ttp-empty-"));
    const { code, out, err } = run(["text"], empty);
    expect({ code, out }).toEqual({ code: 1, out: "" });
    expect(err).toContain(empty);
    expect(err).toContain("any folder above it");
  });

  it("fails on a path that does not exist", () => {
    const missing = join(tmpdir(), "no-such-presentation");
    const { code, out, err } = run(["events", missing], tmpdir());
    expect({ code, out }).toEqual({ code: 1, out: "" });
    expect(err).toContain(missing);
  });
});

describe("ttp on edge cases", () => {
  it("prints nothing for an empty Script", () => {
    const empty = presentation({});
    expect(run(["text"], empty)).toEqual(succeeds(""));
    expect(run(["text", "--events"], empty)).toEqual(succeeds(""));
    expect(run(["events"], empty)).toEqual(succeeds(""));
    expect(run(["events", "--json"], empty)).toEqual(succeeds("[]\n"));
  });

  it("prints only the markers for start events in a Script with no Words", () => {
    const folder = presentation({ namedEvents: [{ id: "e1", name: "intro", anchor: "scriptStart", offset: 0 }] });
    expect(run(["text", "--events"], folder)).toEqual(succeeds("[intro]\n"));
  });

  it("marks several events on one Word in firing order, whatever their offsets", () => {
    const folder = presentation({
      words: [word("w1", "One"), word("w2", "two.")],
      namedEvents: [
        { id: "late", name: "late", anchor: "w2", offset: 500 },
        { id: "early", name: "early", data: 1, anchor: "w2", offset: -50 },
        { id: "on", name: "on", anchor: "w2", offset: 0 },
      ],
    });
    expect(run(["text", "--events"], folder)).toEqual(succeeds("One [early 1] [on] [late] two.\n"));
    expect(run(["events"], folder)).toEqual(
      succeeds('0:00.350  early  1  at "two."\n0:00.400  on  at "two."\n0:00.900  late  at "two."\n'),
    );
  });

  it("drops an event whose anchor Word is missing", () => {
    const folder = presentation({
      words: [word("w1", "Hi.")],
      namedEvents: [{ id: "e1", name: "orphan", anchor: "gone", offset: 0 }],
    });
    expect(run(["text", "--events"], folder)).toEqual(succeeds("Hi.\n"));
    expect(run(["events", "--json"], folder)).toEqual(succeeds("[]\n"));
  });

  it("keeps file order for events at the same Script Time", () => {
    const folder = presentation({
      words: [word("w1", "Hi.", 1000)],
      namedEvents: [
        { id: "b", name: "b", anchor: "w1", offset: 0 },
        { id: "a", name: "a", anchor: "scriptStart", offset: 1000 },
      ],
    });
    expect(run(["events"], folder)).toEqual(succeeds('0:01.000  b  at "Hi."\n0:01.000  a  at start\n'));
  });

  it("shows minutes past 59 unpadded", () => {
    const folder = presentation({ namedEvents: [{ id: "e1", name: "end", anchor: "scriptStart", offset: 4_500_000 }] });
    expect(run(["events"], folder)).toEqual(succeeds("75:00.000  end  at start\n"));
  });

  it.each([
    ["not valid JSON", "{ nope", "not valid JSON"],
    ["no formatVersion", JSON.stringify({ words: [], namedEvents: [] }), "formatVersion"],
    ["a negative formatVersion", JSON.stringify({ formatVersion: -1, words: [], namedEvents: [] }), "formatVersion"],
    ["words that are not an array", JSON.stringify({ formatVersion: 1, words: {}, namedEvents: [] }), "not arrays"],
  ])("fails clearly on a presentation.json with %s", (_, contents, message) => {
    const { code, out, err } = run(["text"], presentationFolder(contents));
    expect({ code, out }).toEqual({ code: 1, out: "" });
    expect(err).toContain(message);
  });

  it.each([[["slides"]], [["text", "--json"]], [["events", "--events"]], [["text", "a", "b"]]])(
    "fails with the usage on %j",
    (args) => {
      const { code, out, err } = run(args, presentation({}));
      expect({ code, out }).toEqual({ code: 2, out: "" });
      expect(err).toContain("usage: ttp");
    },
  );

  it.each([[[]], [["--help"]], [["text", "--help"]], [["events", "-h"]]])("prints help for %j", (args) => {
    const { code, out, err } = run(args, mkdtempSync(join(tmpdir(), "ttp-help-")));
    expect({ code, err }).toEqual({ code: 0, err: "" });
    expect(out).toContain("usage: ttp");
  });

  it("describes both commands and their flags in the top-level help", () => {
    const { out } = run(["--help"], tmpdir());
    for (const text of ["text", "events", "--events", "--json", "Script Text"]) expect(out).toContain(text);
  });
});
