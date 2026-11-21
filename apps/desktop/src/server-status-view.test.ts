import { describe, expect, it } from "vitest";
import { serverStatusView } from "./server-status-view";
import type { ServerStatus } from "./session";

const status = (overrides: Partial<ServerStatus> = {}): ServerStatus => ({
  url: "http://localhost:4747/",
  portNotice: null,
  shadowWarning: null,
  connectedApps: 0,
  ...overrides,
});

describe("serverStatusView", () => {
  it("shows where the Presentation App is served and how many apps are connected", () => {
    expect(serverStatusView(status()).summary).toBe("http://localhost:4747/ · no apps connected");
    expect(serverStatusView(status({ connectedApps: 1 })).summary).toBe("http://localhost:4747/ · 1 app connected");
    expect(serverStatusView(status({ connectedApps: 3 })).summary).toBe("http://localhost:4747/ · 3 apps connected");
  });

  it("raises the port fallback and the shadowed app/_ttp/ as notices", () => {
    expect(serverStatusView(status()).notices).toEqual([]);
    expect(
      serverStatusView(status({ portNotice: "Port 4747 is in use", shadowWarning: "app/_ttp/ is never served" })).notices,
    ).toEqual(["Port 4747 is in use", "app/_ttp/ is never served"]);
  });
});
