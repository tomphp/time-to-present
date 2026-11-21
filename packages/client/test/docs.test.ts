import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exportedNames = [...read("src/index.ts").matchAll(/\b(?:type\s+)?([A-Z][A-Za-z]+|simulate|connect)\b(?=[,\s}])/g)].map(
  (match) => match[1],
);

describe("package docs", () => {
  it.each(["README.md", "llms.txt", "llms-full.txt", "docs/protocol.md", "docs/folder-format.md", "examples"])(
    "publishes %s",
    (path) => expect(pkg.files).toContain(path.split("/")[0]),
  );

  it("describes every export in llms-full.txt", () => {
    const full = read("llms-full.txt");
    const missing = exportedNames.filter((name) => !new RegExp(`\\b${name}\\b`).test(full));
    expect(missing).toEqual([]);
  });

  it("documents every event type of the stream in protocol.md", () => {
    const protocol = read("docs/protocol.md");
    for (const type of ["snapshot", "clock", "tick", "word", "namedEvent", "closed"]) expect(protocol).toContain(`\`${type}\``);
  });
});
