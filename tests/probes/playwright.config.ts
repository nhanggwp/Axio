import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
import path from "node:path";

// Exploratory, paid AI probes for reported problems; failures are recorded in docs.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../../test-results/probes",
  webServer: {
    command: "tsx tests/test-server.ts",
    cwd: path.resolve(import.meta.dirname, "../.."),
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
