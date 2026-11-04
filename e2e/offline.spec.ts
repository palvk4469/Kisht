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

const todayHistory = (item: Awaited<ReturnType<typeof serverItem>>) =>
  (item?.history ?? []).filter((h) => Date.now() - new Date(h.at).getTime() < 24 * 3_600_000);

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

  await goOffline(context);
  await page.reload();
  await expect(page.getByRole("heading", { name: "आज की सूची" })).toBeVisible();

  await logNotReachable(page);
  await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन" })).toContainText("1 भेजने बाकी");
  await expect(page.getByRole("heading", { name: /आज पूरे हुए/ })).toBeVisible();

  const second = await firstLoanId(page);
  await page.getByTestId("loan-card").first().click();
  await page.getByRole("button", { name: "भुगतान का वादा" }).click();
  await page.getByRole("button", { name: /3 दिन में/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  // Killing the page loses nothing: the outbox is on disk.
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "ऑफ़लाइन" })).toContainText("2 भेजने बाकी");
  expect(todayHistory(await serverItem(page, first))).toHaveLength(0);

  await goOnline(page, context);
  await expect(page.getByRole("status").filter({ hasText: "भेजने बाकी" })).toHaveCount(0, {
    timeout: 20_000,
  });

  await expect.poll(async () => (await serverItem(page, first))?.state).toBe("done");
  expect(todayHistory(await serverItem(page, first)).map((h) => h.type)).toEqual(["NOT_REACHABLE"]);
  expect(todayHistory(await serverItem(page, second)).map((h) => h.type)).toEqual(["PROMISE"]);
});

test("a response lost on the way back doesn't create a duplicate", async ({ page }) => {
  await signInAs(page, "vikas.rathore@kisht.example");
  const loanId = await firstLoanId(page);

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
  expect(todayHistory(await serverItem(page, loanId)).map((h) => h.type)).toEqual([
    "NOT_REACHABLE",
  ]);
});

test("a log the server refuses later is shown, not silently lost", async ({ page, context }) => {
  await signInAs(page, "sunita.yadav@kisht.example");
  await offlineReady(page);
  const loanId = await firstLoanId(page);

  await goOffline(context);
  await logNotReachable(page);

  // Signal returns after 7 pm: the phone's list said the window was open, but
  // the server judges by corrected time. The same path catches a wrong clock.
  await setClock(page, "20:00");
  await goOnline(page, context);

  await expect(page.getByRole("alert").filter({ hasText: "दर्ज नहीं हुआ" })).toBeVisible({
    timeout: 20_000,
  });
  expect(todayHistory(await serverItem(page, loanId))).toHaveLength(0);
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
