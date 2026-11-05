import { expect, test } from "@playwright/test";

test.describe("theme", () => {
  test.use({ colorScheme: "dark" });

  test("follows the device before first paint, then remembers an explicit choice", async ({
    page,
  }) => {
    await page.goto("/login");
    // Set by the inline script before React hydrates: no flash of the wrong theme.
    await expect(page.locator("html")).toHaveClass(/dark/);

    const toggle = page.getByRole("button", { name: /^(Theme|थीम):/ });
    await toggle.click(); // device -> light
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Every tap changes what's on screen; there's no state that looks like the last one.
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await toggle.click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
