import { expect, type Page, test } from "@playwright/test";

// The demo clock pins the time of day, so these pass at any hour (D13).
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

async function setClock(page: Page, time: string | null) {
  const at = time && new Date(`${istToday()}T${time}:00+05:30`).toISOString();
  const status = await page.evaluate(async (body) => {
    const res = await fetch("/api/demo/clock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ at: body }),
    });
    return res.status;
  }, at);
  expect(status).toBe(200);
}

async function signInAs(page: Page, email: string, time = "11:00") {
  await page.goto("/login");
  await page.getByLabel(/Email|ईमेल/).fill(email);
  await page.getByLabel(/Password|पासवर्ड/).fill(process.env.DEMO_PASSWORD ?? "Kisht@Demo2026");
  await page.getByRole("button", { name: /^(Sign in|लॉग इन करें)$/ }).click();
  await expect(page).toHaveURL(/\/today$/);
  await setClock(page, time);
  await page.reload();
  await expect(page.getByRole("heading", { name: "आज की सूची" })).toBeVisible();
}

test.afterEach(async ({ page }) => {
  await setClock(page, null).catch(() => {});
});

test("an officer logs an outcome in three taps", async ({ page }) => {
  await signInAs(page, "arjun.patidar@kisht.example");
  await page.getByTestId("loan-card").first().click(); // 1
  await page.getByRole("button", { name: "संपर्क नहीं हुआ" }).click(); // 2
  await page.getByRole("button", { name: "पक्का करें" }).click(); // 3
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("status").filter({ hasText: "सेव हुआ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /आज पूरे हुए/ })).toBeVisible();
});

test("a promise is logged by tapping its date", async ({ page }) => {
  await signInAs(page, "priya.malviya@kisht.example");
  await page.getByTestId("loan-card").first().click(); // 1
  await page.getByRole("button", { name: "भुगतान का वादा" }).click(); // 2
  await page.getByRole("button", { name: /3 दिन में/ }).click(); // 3
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: /वादे का इंतज़ार/ })).toBeVisible();
});

test("after 7 pm calling is blocked, explained and recorded", async ({ page }) => {
  await signInAs(page, "rahul.chouhan@kisht.example", "20:00");
  await expect(page.getByText(/संपर्क का समय बंद है/)).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

  await page.getByRole("button", { name: "कॉल करें" }).first().click();
  await expect(page.getByText(/रोका गया और दर्ज हुआ/)).toBeVisible();

  // No outcome can be logged for a contact that never happened.
  await page.getByTestId("loan-card").first().click();
  await expect(page.getByText(/नया नतीजा .* बाद ही दर्ज होगा/)).toBeVisible();
  await expect(page.getByRole("button", { name: "भुगतान हुआ" })).toHaveCount(0);
});

test("the demo button reopens the window when it is closed", async ({ page }) => {
  await signInAs(page, "rahul.chouhan@kisht.example", "20:00");
  await page.getByRole("button", { name: /डेमो: समय सुबह 11 बजे करें/ }).click();
  await expect(page.getByText(/डेमो समय/)).toBeVisible();
  await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
});

test("the brief's sample loans show their stories", async ({ page }) => {
  await signInAs(page, "imran.qureshi@kisht.example");
  const broken = page.getByTestId("loan-card").filter({ hasText: "Company D" });
  await expect(broken.getByText(/वादा टूटा/)).toBeVisible();
  await expect(broken.getByText("₹2,20,000")).toBeVisible();

  await broken.click();
  await expect(page.getByRole("heading", { name: "यह सूची में क्यों है" })).toBeVisible();
  await expect(page.getByText(/× ₹2,20,000 × 7% =/)).toBeVisible();
});
