import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5175",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10000,
    launchOptions: { channel: "chrome" },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "tsx tests/test-server.ts",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
