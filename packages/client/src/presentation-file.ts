import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PresentationScript } from "./presentation-script.js";

/** The newest `formatVersion` of `presentation.json` this Client reads. */
export const FORMAT_VERSION = 1;
const FILE_NAME = "presentation.json";

export type PresentationFile =
  | { ok: true; script: PresentationScript }
  | { ok: false; error: "not found" | "malformed" | "too new"; message: string };

const failure = (error: "not found" | "malformed" | "too new", message: string): PresentationFile => ({
  ok: false,
  error,
  message,
});

function searchUpFrom(folder: string): string | null {
  for (let current = folder; ; current = dirname(current)) {
    const candidate = join(current, FILE_NAME);
    if (existsSync(candidate)) return candidate;
    if (dirname(current) === current) return null;
  }
}

function fileAt(path: string): string | null {
  if (!existsSync(path)) return null;
  return statSync(path).isDirectory() ? (existsSync(join(path, FILE_NAME)) ? join(path, FILE_NAME) : null) : path;
}

function parse(file: string): PresentationFile {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return failure("malformed", `${file} is not valid JSON`);
  }
  const { formatVersion, words, namedEvents } = (json ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(formatVersion) || (formatVersion as number) < 0) {
    return failure("malformed", `${file} has no formatVersion that is a non-negative integer`);
  }
  if ((formatVersion as number) > FORMAT_VERSION) {
    return failure(
      "too new",
      `${FILE_NAME} is format ${formatVersion}; this ttp reads up to ${FORMAT_VERSION}: update @time-to-present/client`,
    );
  }
  if (!Array.isArray(words) || !Array.isArray(namedEvents)) {
    return failure("malformed", `${file} has words or namedEvents that are not arrays`);
  }
  return { ok: true, script: { words, namedEvents } };
}

/** Reads the Script of the `presentation.json` at `path` (a Presentation folder or the file), else the first one found searching up from `cwd`. */
export function loadPresentation(cwd: string, path?: string): PresentationFile {
  if (path === undefined) {
    const found = searchUpFrom(cwd);
    return found ? parse(found) : failure("not found", `no ${FILE_NAME} in ${cwd} or any folder above it`);
  }
  const target = resolve(cwd, path);
  const found = fileAt(target);
  return found ? parse(found) : failure("not found", `no ${FILE_NAME} at ${target}`);
}
