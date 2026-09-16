// Capture README screenshots from the running dev server.
// node scripts/shots.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

mkdirSync("docs", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1.5 });

await page.goto("http://localhost:3000/parakh", { waitUntil: "networkidle0" });
await page.screenshot({ path: "docs/upload.png" });

// run the sample exam end-to-end
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => /sample exam/i.test(b.textContent))
    ?.click();
});
await page.waitForFunction(
  () => document.body.textContent.includes("sample_answer_sheet"),
  { timeout: 30000 }
);
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => /run the check|start mapping/i.test(b.textContent))
    ?.click();
});
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: "docs/loading.png" });
await page.waitForFunction(
  () => /accounted for|Grading Summary/i.test(document.body.textContent),
  { timeout: 180000, polling: 1000 }
);
// select Q2 so a highlight is visible
await page.evaluate(() => {
  document.getElementById("qcard-q2")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "docs/mapping.png" });

await browser.close();
console.log("wrote docs/upload.png, docs/loading.png, docs/mapping.png");
