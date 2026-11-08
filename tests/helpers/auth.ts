import { expect, type APIRequestContext } from "@playwright/test";
export const origin = "http://127.0.0.1:5175",
  password = "Axio-Test-Pass-2026!";
export async function post(
  request: APIRequestContext,
  path: string,
  data: unknown,
) {
  return request.post("/api/auth/" + path, {
    data,
    headers: { Origin: origin },
  });
}
export async function mailLink(email: string, contains: string) {
  let link = "";
  await expect
    .poll(
      async () => {
        const mails = (await fetch(
          "http://127.0.0.1:3006/?to=" + encodeURIComponent(email),
        ).then((r) => r.json())) as { text: string }[];
        for (const mail of [...mails].reverse()) {
          const urls = mail.text.match(/https?:\/\/[^\s<>\"]+/g) ?? [];
          link = urls.find((url) => url.includes(contains)) ?? "";
          if (link) break;
        }
        return link;
      },
      { timeout: 15000 },
    )
    .not.toBe("");
  return link;
}
export async function verifiedAccount(
  request: APIRequestContext,
  email: string,
) {
  const signup = await post(request, "sign-up/email", {
    email,
    password,
    name: "Người dùng kiểm thử",
    callbackURL: origin + "/?auth=verified",
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await request.get(await mailLink(email, "verify-email"));
}
