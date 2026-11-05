import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { setClock, signInAs } from "./helpers";

// WCAG 2.1 AA on every screen, in both themes. The officers' app is used
// outdoors on cheap screens, so contrast isn't a nicety here.

async function noViolations(page: Page, screen: string) {
  await page.waitForLoadState("networkidle");
  // A fading colour is only ever measured halfway, so let it finish.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(", ")}`,
    ),
    screen,
  ).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test.afterEach(async ({ page }) => {
      await setClock(page, null).catch(() => {});
    });

    test("officer screens meet WCAG AA", async ({ page }) => {
      await page.goto("/login");
      await noViolations(page, "sign-in");
      await signInAs(page, "neha.solanki@kisht.example");
      await noViolations(page, "today");
      await page.getByTestId("loan-card").first().click();
      await page.waitForURL(/\/today\/loan/);
      await noViolations(page, "loan");
      await page.getByRole("button", { name: "भुगतान का वादा" }).click();
      await noViolations(page, "outcome sheet");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "रिमाइंडर भेजें" }).click();
      await expect(page.getByRole("dialog").getByText(/नमस्ते/)).toBeVisible();
      await noViolations(page, "reminder sheet");
      await page.keyboard.press("Escape");
      await page.goto("/today/promises");
      await noViolations(page, "promises");
    });

    test("manager screens meet WCAG AA", async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: "English" }).click();
      await page.getByText("Sanjay Joshi").click();
      await expect(page).toHaveURL(/\/manager\/dashboard$/);
      for (const screen of ["dashboard", "lists", "promises", "activity", "import"]) {
        await page.goto(`/manager/${screen}`);
        await noViolations(page, screen);
      }
    });
  });
}
