import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { serverItem, setClock, signInAs } from "./helpers";

// Real offline: the browser context has no network, and the service worker and
// IndexedDB have to carry the app. Times are pinned by the demo clock.

async function offlineReady(page: Page) {
  // The worker has to be active and in control before the network goes away.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
      timeout: 15_000,
    })
    .toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "आज की सूची" })).toBeVisible();
}

// Chrome's offline emulation doesn't reliably cover pages a service worker
// controls, so API calls are cut explicitly too. Otherwise a "lost" signal leaks.
async function goOffline(context: BrowserContext) {
  await context.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);
}

async function goOnline(page: Page, context: BrowserContext) {
  await context.unroute("**/api/**");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

async function firstLoanId(page: Page) {
  const href = await page.getByTestId("loan-card").first().getAttribute("href");
  return new URL(href ?? "", "http://x").searchParams.get("id") ?? "";
}

async function logNotReachable(page: Page) {
  await page.getByTestId("loan-card").first().click();
  await page.getByRole("button", { name: "संपर्क नहीं हुआ" }).click();
  await page.getByRole("button", { name: "पक्का करें" }).click();
  await expect(page).toHaveURL(/\/today$/);
}

type Item = Awaited<ReturnType<typeof serverItem>>;
const historyIds = (item: Item) => (item?.history ?? []).map((h) => h.id);
/** What the server added since. The seeded history varies with the day it was made. */
const addedSince = (item: Item, before: string[]) =>
  (item?.history ?? []).filter((h) => !before.includes(h.id)).map((h) => h.type);

test.afterEach(async ({ page, context }) => {
  await context.unroute("**/api/**");
  await context.setOffline(false);
  await setClock(page, null).catch(() => {});
});

test("works with no signal, survives a reload, and sends once when signal returns", async ({
  page,
  context,
}) => {
  await signInAs(page, "neha.solanki@kisht.example");
  await offlineReady(page);
  const first = await firstLoanId(page);
  const firstBefore = historyIds(await serverItem(page, first));

  await goOffline(context);
  await page.reload();
  await expect(page.getByRole("heading", { name: "आज की सूची" })).toBeVisible();

  await logNotReachable(page);
  await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन" })).toContainText("1 भेजने बाकी");
  await expect(page.getByRole("heading", { name: /आज पूरे हुए/ })).toBeVisible();

  const second = await firstLoanId(page);
  const secondBefore = historyIds(await serverItem(page, second));
  await page.getByTestId("loan-card").first().click();
  await page.getByRole("button", { name: "भुगतान का वादा" }).click();
  await page.getByRole("button", { name: /3 दिन में/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Killing the page loses nothing: the outbox is on disk.
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन" })).toContainText("2 भेजने बाकी");
  expect(addedSince(await serverItem(page, first), firstBefore)).toEqual([]);

  await goOnline(page, context);
  await expect(page.getByRole("status").filter({ hasText: "भेजने बाकी" })).toHaveCount(0, {
    timeout: 20_000,
  });

  await expect.poll(async () => (await serverItem(page, first))?.state).toBe("done");
  expect(addedSince(await serverItem(page, first), firstBefore)).toEqual(["NOT_REACHABLE"]);
  expect(addedSince(await serverItem(page, second), secondBefore)).toEqual(["PROMISE"]);
});

test("a day's work done offline reaches the manager, with the reminder sent after", async ({
  page,
  context,
  browser,
}) => {
  await signInAs(page, "priya.malviya@kisht.example");
  await offlineReady(page);
  const card = page.getByTestId("loan-card").first();
  const name = (await card.locator("h2").textContent()) ?? "";
  const loanId = await firstLoanId(page);

  await goOffline(context);
  await card.click();
  await page.getByRole("button", { name: "भुगतान का वादा" }).click();
  await page.getByRole("button", { name: /3 दिन में/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन" })).toContainText("1");

  // Signal returns: it sends itself, and the officer follows up with a reminder.
  await goOnline(page, context);
  await expect(page.getByRole("status").filter({ hasText: /भेजे जा रहे|ऑफ़लाइन/ })).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.goto(`/today/loan?id=${loanId}`);
  await page.getByRole("button", { name: "रिमाइंडर भेजें" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/वादा/)).toBeVisible();
  await sheet.getByRole("button", { name: "भेजें" }).click();
  await expect(sheet).toBeHidden();

  // The manager, on another device, sees all of it.
  const office = await browser.newContext();
  const desk = await office.newPage();
  await desk.goto("/login");
  await desk.getByRole("button", { name: "English" }).click();
  await desk.getByText("Sanjay Joshi").click();
  await expect(desk).toHaveURL(/\/manager\/dashboard$/);
  await desk.goto("/manager/promises");
  await expect(desk.getByText(name).locator("visible=true").first()).toBeVisible();
  await desk.goto("/manager/activity");
  // Newest first: the reminder, then the visit. The seed may hold older contacts too.
  const entries = desk.getByTestId("activity-list").locator("li").filter({ hasText: name });
  await expect(entries.nth(0).getByLabel("Message")).toBeVisible();
  await expect(entries.nth(1).getByLabel("Visit")).toBeVisible();
  await office.close();
});

test("a response lost on the way back doesn't create a duplicate", async ({ page }) => {
  await signInAs(page, "vikas.rathore@kisht.example");
  const loanId = await firstLoanId(page);
  const before = historyIds(await serverItem(page, loanId));

  // The server stores the batch, but the phone never hears back.
  let lost = 0;
  await page.route("**/api/sync", async (route) => {
    if (lost === 0) {
      lost++;
      await route.fetch();
      await route.abort("connectionreset");
    } else {
      await route.continue();
    }
  });

  await logNotReachable(page);
  await expect(page.getByRole("status").filter({ hasText: /भेजने बाकी|भेजे जा रहे/ })).toHaveCount(0, {
    timeout: 20_000,
  });
  expect(lost).toBe(1);
  expect(addedSince(await serverItem(page, loanId), before)).toEqual(["NOT_REACHABLE"]);
});

test("a log the server refuses later is shown, not silently lost", async ({ page, context }) => {
  await signInAs(page, "sunita.yadav@kisht.example");
  await offlineReady(page);
  const loanId = await firstLoanId(page);
  const before = historyIds(await serverItem(page, loanId));

  await goOffline(context);
  await logNotReachable(page);

  // Signal returns after 7 pm: the phone's list said the window was open, but
  // the server judges by corrected time. The same path catches a wrong clock.
  await setClock(page, "20:00");
  await goOnline(page, context);

  await expect(page.getByRole("alert").filter({ hasText: "दर्ज नहीं हुआ" })).toBeVisible({
    timeout: 20_000,
  });
  expect(addedSince(await serverItem(page, loanId), before)).toEqual([]);
});

test("signing out warns about unsent work and clears borrower data from the phone", async ({
  page,
  context,
}) => {
  await signInAs(page, "imran.qureshi@kisht.example");
  await offlineReady(page);

  await goOffline(context);
  await logNotReachable(page);

  await page.getByRole("button", { name: "लॉग आउट" }).click();
  await expect(page.getByRole("heading", { name: /अभी भेजी नहीं गईं/ })).toBeVisible();
  await page.getByRole("button", { name: "फिर भी लॉग आउट करें" }).click();
  await expect(page).toHaveURL(/\/login$/);

  const stored = await page.evaluate(
    () =>
      new Promise<{ cached: number; queued: number }>((resolve) => {
        const open = indexedDB.open("kisht-field");
        open.onsuccess = () => {
          const tx = open.result.transaction(["today", "outbox"]);
          const cached = tx.objectStore("today").count();
          const queued = tx.objectStore("outbox").count();
          tx.oncomplete = () => resolve({ cached: cached.result, queued: queued.result });
        };
      }),
  );
  expect(stored.cached).toBe(0);
  expect(stored.queued).toBeGreaterThan(0);
});

test("one invalid entry is set aside and doesn't jam the rest", async ({ page }) => {
  await signInAs(page, "priya.malviya@kisht.example");
  // The server refuses anything carrying this note as invalid, as it would a corrupt entry.
  await page.route("**/api/sync", async (route) => {
    const body = route.request().postDataJSON() as { outcomes: { note: string | null }[] };
    if (body.outcomes.some((o) => o.note === "CORRUPT")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: '{"error":"Invalid input"}',
      });
    } else {
      await route.continue();
    }
  });

  await page.getByTestId("loan-card").first().click();
  await page.getByRole("button", { name: "संपर्क नहीं हुआ" }).click();
  await page.getByRole("button", { name: /नोट जोड़ें/ }).click();
  await page.getByLabel(/नोट/).fill("CORRUPT");
  await page.getByRole("button", { name: "पक्का करें" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "सेव नहीं हो सकी" })).toBeVisible({
    timeout: 20_000,
  });

  const nextLoan = await firstLoanId(page);
  await logNotReachable(page);
  await expect
    .poll(async () => (await serverItem(page, nextLoan))?.state, { timeout: 20_000 })
    .toBe("done");
  await expect(page.getByRole("status").filter({ hasText: /भेजने बाकी|भेजे जा रहे/ })).toHaveCount(0, {
    timeout: 20_000,
  });
});

test("opens at once from the phone's copy, even if the network hangs", async ({ page }) => {
  await signInAs(page, "arjun.patidar@kisht.example");
  const name = await page.getByTestId("loan-card").first().locator("h2").textContent();

  // Weak signal: the request neither succeeds nor fails.
  await page.route("**/api/officer/today", () => {});
  await page.route("**/api/me", () => {});
  await page.reload();
  await expect(page.getByTestId("loan-card").first().locator("h2")).toHaveText(name ?? "", {
    timeout: 3000,
  });
});
