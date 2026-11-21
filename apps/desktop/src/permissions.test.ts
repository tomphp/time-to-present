import { expect, test } from "vitest";
import lib from "../src-tauri/src/lib.rs?raw";
import defaultCapability from "../src-tauri/capabilities/default.json";
import permissions from "../src-tauri/permissions/app.toml?raw";

const handled = [...(lib.match(/generate_handler!\[([^\]]*)\]/)?.[1].matchAll(/(\w+)\s*(?:,|$)/g) ?? [])].map(
  ([, name]) => name,
);

const allowedBy = Object.fromEntries(
  permissions
    .split("[[permission]]")
    .slice(1)
    .map((block) => [
      block.match(/identifier = "([\w-]+)"/)?.[1],
      [...(block.match(/commands\.allow = \[([^\]]*)\]/)?.[1].matchAll(/"(\w+)"/g) ?? [])].map(([, name]) => name),
    ]),
);

test("the ACL allows every command the core handles, as Tauri checks them all", () => {
  expect([...allowedBy["app-windows"], ...allowedBy["forward-key"]].sort()).toEqual([...handled].sort());
});

test("the Presentation Window's page may only forward keys, and the app's windows forward them only from the Teleprompter", () => {
  expect(allowedBy["forward-key"]).toEqual(["forward_key"]);
  expect(allowedBy["app-windows"]).not.toContain("forward_key");
  expect(defaultCapability.windows).toContain("teleprompter");
  expect(defaultCapability.permissions).toContain("forward-key");
});
