import type { ModelProgress } from "./commands";

export function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

export function describeProgress({ name, downloaded, total }: ModelProgress) {
  const received = total ? `${Math.floor((downloaded * 100) / total)}%` : formatBytes(downloaded);
  return `Downloading ${name}: ${received}`;
}
