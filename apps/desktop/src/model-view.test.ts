import { describe, expect, it } from "vitest";
import { describeProgress, formatBytes } from "./model-view";

describe("formatBytes", () => {
  it("uses the largest readable unit", () => {
    expect(formatBytes(1_624_555_275)).toBe("1.6 GB");
    expect(formatBytes(147_964_211)).toBe("148 MB");
    expect(formatBytes(512)).toBe("1 KB");
  });

  it("moves up a unit when rounding reaches the next one", () => {
    expect(formatBytes(999_600)).toBe("1 MB");
    expect(formatBytes(999_600_000)).toBe("1.0 GB");
  });
});

describe("describeProgress", () => {
  it("shows a percentage when the size is known", () => {
    expect(describeProgress({ name: "base.en", downloaded: 50, total: 200 })).toBe(
      "Downloading base.en: 25%",
    );
  });

  it("shows the bytes received when the size is unknown", () => {
    expect(describeProgress({ name: "base.en", downloaded: 2_000_000, total: null })).toBe(
      "Downloading base.en: 2 MB",
    );
  });
});
