import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  forbidOnly: true,
  reporter: "line",
  use: { browserName: "chromium" },
});
