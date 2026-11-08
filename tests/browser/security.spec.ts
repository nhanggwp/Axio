import { test, expect } from "../fixtures";
test("development server never serves environment, source brief or account database files", async ({
  request,
}) => {
  for (const file of [
    "/.env",
    "/prompt.md",
    "/data/axio.sqlite",
    "/data/.auth-secret",
    "/test-results/server/test.sqlite",
  ])
    expect((await request.get(file)).status(), file).toBe(403);
});
