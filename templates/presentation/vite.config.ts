import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { outDir: "../app", emptyOutDir: true },
  server: { proxy: { "/_ttp": "http://localhost:4747" } },
  test: { environment: "jsdom" },
});
