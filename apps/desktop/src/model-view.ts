import type { ModelProgress } from "./commands";

export function formatBytes(bytes: number) {
  const megabytes = Math.round(bytes / 1e6);
  const kilobytes = Math.round(bytes / 1e3);
  if (megabytes >= 1000) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (kilobytes >= 1000) return `${megabytes} MB`;
  return `${Math.max(1, kilobytes)} KB`;
}

export function describeProgress({ name, downloaded, total }: ModelProgress) {
  const received = total ? `${Math.floor((downloaded * 100) / total)}%` : formatBytes(downloaded);
  return `Downloading ${name}: ${received}`;
}
