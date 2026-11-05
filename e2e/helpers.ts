import { expect, type Page } from "@playwright/test";

const BASE = `http://localhost:${process.env.E2E_WEB_PORT ?? "3000"}`;
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** Moves the server's demo clock (D13), working even while the page is offline. */
export async function setClock(page: Page, time: string | null) {
  const at = time && new Date(`${istToday()}T${time}:00+05:30`).toISOString();
  const res = await page.request.post(`${BASE}/api/demo/clock`, {
    headers: { origin: BASE },
    data: { at },
  });
  expect(res.status()).toBe(200);
}

export async function signInAs(page: Page, email: string, time = "11:00") {
  await page.goto("/login");
  await page.getByLabel(/Email|ईमेल/).fill(email);
  await page.getByLabel(/Password|पासवर्ड/).fill(process.env.DEMO_PASSWORD ?? "Kisht@Demo2026");
  await page.getByRole("button", { name: /^(Sign in|लॉग इन करें)$/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await setClock(page, time);
  await page.reload();
  await expect(page.getByRole("heading", { name: "आज की सूची" })).toBeVisible();
}

/** The API's view of a loan on today's list, regardless of what the page shows. */
export async function serverItem(page: Page, loanId: string) {
  const res = await page.request.get(`${BASE}/api/officer/today`);
  const list = (await res.json()) as {
    items: { loanId: string; state: string; history: { type: string; at: string }[] }[];
  };
  return list.items.find((i) => i.loanId === loanId);
}
