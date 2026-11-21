import type { ServerStatus } from "./session";

export interface ServerStatusView {
  summary: string;
  notices: string[];
}

const connected = (count: number) =>
  count === 0 ? "no apps connected" : count === 1 ? "1 app connected" : `${count} apps connected`;

export const serverStatusView = (status: ServerStatus): ServerStatusView => ({
  summary: `${status.url} · ${connected(status.connectedApps)}`,
  notices: [status.portNotice, status.shadowWarning].filter((notice) => notice !== null),
});
