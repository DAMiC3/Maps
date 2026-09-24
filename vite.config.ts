import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative base so the build works on GitHub Pages under /<repo>/.
  base: "./",
  test: {
    environment: "jsdom",
  },
});
