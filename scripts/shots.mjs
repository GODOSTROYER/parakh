// Capture README screenshots from the running dev server.
// node scripts/shots.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync } from "fs";

mkdirSync("docs", { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: ["--force-device-scale-factor=1.5"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1.5 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.screenshot({ path: "docs/upload.png" });

const jobId = process.argv[2] ?? "cad1c9b6";
await page.goto(`http://localhost:3000/?job=${jobId}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
// select the second question so the highlight shows
await page.evaluate(() => {
  const cards = document.querySelectorAll("main .cursor-pointer");
  cards[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: "docs/mapping.png" });

await browser.close();
console.log("wrote docs/upload.png, docs/mapping.png");
