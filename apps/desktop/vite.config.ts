import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: { start: "index.html", editor: "editor.html", settings: "settings.html", teleprompter: "teleprompter.html" },
    },
  },
});
