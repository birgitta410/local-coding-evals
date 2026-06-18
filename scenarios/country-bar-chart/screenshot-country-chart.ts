import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const htmlArg = process.argv.find((a, i) => i >= 2 && a !== "--");
if (!htmlArg) {
  console.error("Usage: npm run screenshot-country-chart -- <path-to-timeline.html>");
  process.exit(1);
}
const HTML_FILE = htmlArg.startsWith("file://") ? htmlArg : `file://${path.resolve(htmlArg)}`;
const OUTPUT_DIR = path.resolve("results");

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto(HTML_FILE);
  await page.waitForLoadState("networkidle");

  // Scroll so the "Countries" heading is at the top of the viewport
  const heading = page.getByRole("heading", { name: /countries/i });
  await heading.waitFor();
  const headingTop = await heading.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((top) => window.scrollTo(0, top), headingTop);
  await page.waitForTimeout(500);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(OUTPUT_DIR, `country-chart-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  console.log(`Screenshot saved: ${screenshotPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
