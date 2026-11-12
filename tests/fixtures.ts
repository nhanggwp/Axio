import { test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
/** Transparent cache of original public CDN bytes, not a geometry mock. */
export const test = base.extend<{ showWelcome: boolean }>({
  showWelcome: [false, { option: true }],
  page: async ({ page, showWelcome }, use) => {
    if (!showWelcome) await page.addInitScript(() => { try { localStorage.setItem("axio-welcome-seen-v1", "1"); sessionStorage.setItem("axio-welcome-visit-v2", "1"); } catch {} });
    const directory = path.resolve(".cache/geogebra");
    await mkdir(path.resolve("docs"), { recursive: true });
    await mkdir(directory, { recursive: true });
    await page.route(
      /^https:\/\/(?:www\.|cdn\.)?geogebra\.org\/apps\//,
      async (route) => {
        const url = route.request().url(),
          key = createHash("sha256").update(url).digest("hex"),
          bodyPath = path.join(directory, key + ".bin"),
          metaPath = path.join(directory, key + ".json");
        try {
          const modified = await stat(metaPath);
          if (Date.now() - modified.mtimeMs < 24 * 60 * 60 * 1000) {
            const metadata = JSON.parse(await readFile(metaPath, "utf8")) as {
              status: number;
              headers: Record<string, string>;
            };
            await route.fulfill({
              ...metadata,
              body: await readFile(bodyPath),
            });
            return;
          }
        } catch {}
        try {
          const response = await route.fetch({ timeout: 45000, maxRetries: 1 });
          const body = await response.body();
          if (response.status() === 200) {
            const headers = response.headers();
            delete headers["content-encoding"];
            delete headers["content-length"];
            await writeFile(bodyPath, body);
            await writeFile(metaPath, JSON.stringify({ status: 200, headers }));
            await route.fulfill({ status: 200, headers, body });
          } else await route.fulfill({ response });
        } catch {
          await route.continue();
        }
      },
    );
    await use(page);
  },
});
export { expect };

export type { Page, APIRequestContext } from "@playwright/test";
