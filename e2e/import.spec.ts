import { expect, test } from "@playwright/test";
import { OVERDUE_COLUMNS } from "../packages/domain/src/csv.ts";

test.describe.configure({ mode: "serial" });

test("signed-out visitors land on sign-in, in Hindi by default", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "किश्त कलेक्शन" })).toBeVisible();
});

test("an officer is routed to their list, not the manager screens", async ({ page }) => {
  await page.goto("/login");
  await page.getByText("Rahul Chouhan").click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/manager/import");
  await expect(page).toHaveURL(/\/today$/);
});

test("a branch manager previews and commits the daily import", async ({ page }, info) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByText("Sanjay Joshi").click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await page.getByRole("link", { name: "Daily import" }).click();
  await expect(page).toHaveURL(/\/manager\/import$/);

  const download = page.waitForEvent("download");
  await page.getByText("Download today's sample export").click();
  const file = info.outputPath("sample.csv");
  await (await download).saveAs(file);

  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Ready to commit")).toBeVisible();
  // The sample contains exactly one bad row, which is reported, not fatal.
  await expect(page.getByText("must be a 10-digit Indian mobile number")).toBeVisible();

  await page.getByRole("button", { name: "Commit import" }).click();
  await expect(page.getByText("Import committed")).toBeVisible();
  await expect(page.getByText(/Promises resolved/)).toBeVisible();
});

test("a file missing most loans can't be committed until someone confirms", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByText("Sanjay Joshi").click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await page.goto("/manager/import");
  await page.locator("input[type=file]").setInputFiles({
    name: "incomplete.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `${OVERDUE_COLUMNS.join(",")}\nLN-10293,Company B (packaging unit),packaging unit,9000012345,"Plot 1, Indore",452001,640000,12,20000,,,IND`,
    ),
  });
  await page.getByRole("button", { name: "Check file" }).click();
  const warning = page.getByText(/missing from this file/);
  await expect(warning).toBeVisible();

  const commit = page.getByRole("button", { name: "Commit import" });
  await expect(commit).toBeDisabled();
  await page.getByLabel(/I confirm these .* loans are no longer overdue/).check();
  await expect(commit).toBeEnabled();
  // Stop here: committing would really cure the demo branch for the tests after this one.
});

test("a wrong password is explained, not silently ignored", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByLabel("Email").fill("sanjay.joshi@kisht.example");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next adds its own role=alert route announcer, so match the message itself.
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});
