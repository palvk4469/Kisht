// Prints docs/tdd/index.html to docs/TDD.pdf, with the assumptions appendix
// generated from docs/ASSUMPTIONS.md so the two can't disagree. Run: pnpm tdd
import { readFile, rm, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const docs = new URL("../docs/", import.meta.url);

const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const inline = (text) =>
  escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const assumptions = (await readFile(new URL("ASSUMPTIONS.md", docs), "utf8"))
  .split("\n")
  .filter((line) => /^\| A\d+/.test(line))
  .map((line) => {
    const [id, text] = line
      .split("|")
      .slice(1, 3)
      .map((cell) => cell.trim());
    return `<tr><td class="id">${id}</td><td>${inline(text)}</td></tr>`;
  })
  .join("\n");

const source = new URL("tdd/index.html", docs);
const html = (await readFile(source, "utf8")).replace("<!-- ASSUMPTIONS -->", assumptions);
const built = new URL("tdd/.built.html", docs);
await writeFile(built, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(built.href, { waitUntil: "load" });
await page.pdf({
  path: new URL("TDD.pdf", docs).pathname,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#777;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
});
await browser.close();
await rm(built);
