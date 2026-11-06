import { expect, type Page, test } from "@playwright/test";
import { setClock, signInAs } from "./helpers";

async function signInManager(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByText("Sanjay Joshi").click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await setClock(page, "11:00");
}

test.afterEach(async ({ page }) => {
  await setClock(page, null).catch(() => {});
});

test("a manager moves a loan up with a reason, and the officer sees it", async ({
  page,
  browser,
}) => {
  await signInManager(page);
  await page.getByRole("link", { name: "Officers' lists" }).click();
  await page.getByRole("button", { name: /Arjun Patidar/ }).click();

  const list = page.getByTestId("officer-list");
  const second = list.locator("li").nth(1);
  const name = (await second.getByRole("button", { name: /^Open / }).textContent()) ?? "";
  await second.getByRole("button", { name: /Move .* up/ }).click();

  const reason = `Borrower at the shop today ${Date.now()}`;
  const confirm = page.getByRole("dialog").getByRole("button", { name: "Move" });
  await expect(confirm).toBeDisabled(); // A reason is required.
  await page.getByLabel("Reason").fill(reason);
  await confirm.click();
  await expect(list.locator("li").first()).toContainText(name);
  await expect(list.locator("li").first()).toContainText(reason);

  // The officer's own list reflects it.
  const officer = await browser.newContext();
  const phone = await officer.newPage();
  await signInAs(phone, "arjun.patidar@kisht.example");
  await expect(phone.getByTestId("loan-card").first()).toContainText(name);
  await expect(phone.getByText(reason).first()).toBeVisible();
  await officer.close();

  // Handing it back to the model.
  await list.locator("li").first().getByRole("button", { name: "Undo move" }).click();
  await expect(list.locator("li").first()).not.toContainText(reason);
});

test("a loan in an uncovered pincode can be assigned from the queue", async ({ page }) => {
  await signInManager(page);
  await page.goto("/manager/lists");
  await expect(page.getByRole("heading", { name: "Today's lists" })).toBeVisible();
  const queue = page.locator("section").filter({ hasText: "Waiting for an officer" });
  const before = await queue.getByRole("button", { name: "Assign" }).count();
  test.skip(before === 0, "queue already emptied by an earlier run");
  await queue.getByRole("button", { name: "Assign" }).first().click();
  await page.getByLabel("Reason").fill("Nearest officer for now");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () =>
      (await queue.count()) === 0 ? 0 : queue.getByRole("button", { name: "Assign" }).count(),
    )
    .toBe(before - 1);
});

test("an officer's dispute reaches the manager, who can reopen contact", async ({
  page,
  browser,
}) => {
  const officer = await browser.newContext();
  const phone = await officer.newPage();
  await signInAs(phone, "rahul.chouhan@kisht.example");
  const name = (await phone.getByTestId("loan-card").first().locator("h2").textContent()) ?? "";
  await phone.getByTestId("loan-card").first().click();
  await phone.getByRole("button", { name: "विवाद" }).click();
  await phone.getByLabel(/नोट/).fill("Amount is wrong");
  await phone.getByRole("button", { name: "पक्का करें" }).click();
  await expect(phone.getByRole("heading", { name: /संपर्क रुका है/ })).toBeVisible();
  await expect(phone.getByRole("status").filter({ hasText: /भेजे जा रहे/ })).toHaveCount(0, {
    timeout: 15_000,
  });

  await signInManager(page);
  await page.goto("/manager/lists");
  const row = page.locator("li").filter({ hasText: name }).filter({ hasText: "Amount is wrong" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Allow contact" }).click();
  await page.getByLabel("What did you find?").fill("Checked the ledger with the borrower");
  await page.getByRole("dialog").getByRole("button", { name: "Allow contact" }).click();
  await expect(row).toHaveCount(0);
  await officer.close();
});

test("the promise tracker filters, and shows the reminders", async ({ page }) => {
  await signInManager(page);
  await page.getByRole("link", { name: "Promises" }).click();
  await expect(page.getByRole("heading", { name: "Reminders" })).toBeVisible();
  await expect(page.getByText("Sending is simulated")).toBeVisible();
  await expect(page.getByText("Open").first()).toBeVisible();
  await page.getByRole("button", { name: "Broken" }).click();
  await expect(page.getByText("Broken").nth(1)).toBeVisible();
  await page.getByRole("combobox", { name: "Officer" }).selectOption({ label: "Neha Solanki" });
  await expect(
    page.locator("tr:visible, li:visible").filter({ hasText: "Neha Solanki" }).first(),
  ).toBeVisible();
});

test("an officer's promises screen groups what to follow up", async ({ page }) => {
  await signInAs(page, "imran.qureshi@kisht.example");
  await page.locator('a[href="/today/promises"]').locator("visible=true").click();
  await expect(page.getByRole("heading", { name: /इस हफ्ते टूटे/ })).toBeVisible();
  await expect(page.locator("li").filter({ hasText: "Company D" })).toContainText("₹9,200");
});

async function fits(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, path).toBeLessThanOrEqual(client);
}

test("every manager screen fits, with no sideways scrolling", async ({ page }) => {
  await signInManager(page);
  for (const path of [
    "/manager/dashboard",
    "/manager/lists",
    "/manager/promises",
    "/manager/activity",
    "/manager/import",
  ])
    await fits(page, path);
});

test("every tab is fully in view, on phones and laptops alike", async ({ page }) => {
  await signInManager(page);
  await page.goto("/manager/import");
  const tabs = page.locator("nav a").locator("visible=true");
  await expect(tabs).toHaveCount(5);
  for (const tab of await tabs.all()) await expect(tab).toBeInViewport({ ratio: 0.95 });
  await expect(page.locator('nav a[aria-current="page"]').locator("visible=true")).toHaveAttribute(
    "href",
    "/manager/import",
  );
});

test("every officer screen fits, with no sideways scrolling", async ({ page }) => {
  await signInAs(page, "priya.malviya@kisht.example");
  const href = (await page.getByTestId("loan-card").first().getAttribute("href")) ?? "/today";
  for (const path of ["/today", href, "/today/promises"]) await fits(page, path);
});

test("the dashboard answers the head's question, with its numbers checkable", async ({ page }) => {
  await signInManager(page);
  await expect(page.getByText("Roll rate, 1–30 to 31+")).toBeVisible();
  await expect(page.getByRole("img", { name: "Roll rate by week" })).toBeVisible();
  await expect(page.getByText("Target 16%").first()).toBeVisible();

  // Every chart has a table with the same values.
  await page.getByText("View as a table").first().click();
  await expect(page.getByRole("columnheader", { name: "Indore Central" })).toBeVisible();

  // The back-test puts the score against what officers do today.
  await expect(page.getByText("Is the priority score earning its place?")).toBeVisible();
  await expect(page.getByText("Oldest first (today's practice)")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^officers-.*\.csv$/);
});

test("the head of collections can filter to one branch", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByText("Anil Mehta").click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await expect(page.getByRole("img", { name: "Roll rate by week" })).toBeVisible();
  await page.getByLabel("Branch").selectOption({ label: "Pithampur" });
  await page.getByText("View as a table").first().click();
  await expect(page.getByRole("columnheader", { name: "Pithampur" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Indore Central" })).toHaveCount(0);
});

test("the activity log shows the rule was kept, and flags what to check", async ({ page }) => {
  await signInManager(page);
  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page.getByText("No contact got through outside 8 am to 7 pm")).toBeVisible();

  await page.getByRole("button", { name: "Visits to check" }).click();
  await expect(
    page
      .getByTestId("activity-list")
      .getByText(/No GPS|m from address/)
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Blocked" }).click();
  await expect(
    page.getByTestId("activity-list").getByText("Blocked: after hours").first(),
  ).toBeVisible();
});

test("when the dashboard can't load, it says so and retry works", async ({ page }) => {
  await signInManager(page);
  await page.route("**/api/manager/dashboard", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"Something went wrong"}',
    }),
  );
  await page.goto("/manager/dashboard");
  await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 15_000 });
  await page.unroute("**/api/manager/dashboard");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("img", { name: "Roll rate by week" })).toBeVisible();
});

test("a manager can open any loan, and showing the number is deliberate", async ({ page }) => {
  await signInManager(page);
  await page
    .getByRole("button", { name: /^Open Company/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Loan details" });
  await expect(sheet.getByText(/••••••\d{4}/)).toBeVisible();
  await sheet.getByRole("button", { name: "Show number" }).click();
  await expect(sheet.locator('a[href^="tel:"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("an unknown address gets a helpful page, and security headers are set", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /शुरुआत पर जाएँ|Go to the start/ })).toBeVisible();
  const headers = res?.headers() ?? {};
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
});
