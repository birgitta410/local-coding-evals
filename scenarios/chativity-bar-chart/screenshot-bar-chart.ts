import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.resolve("results");
const SPACE_NAME = "AI-assisted Software Delivery [AIFSD]";
const LOGIN_TIMEOUT_MS = 5 * 60_000;
// Persistent profile dir -- keeps full browser state (cookies, IndexedDB, service workers, etc.)
const PROFILE_DIR = path.resolve("scenarios/chativity-bar-chart/.browser-profile");

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);

  // The auth flow is multi-step (Google -> Okta SSO -> Google consent -> app), so
  // don't try to detect it. Just wait for the space list to appear, which only
  // succeeds once the full auth chain is done and the app is rendered.
  console.log(`If prompted, complete login/OAuth consent in the browser.`);
  console.log(`Looking for space: "${SPACE_NAME}"...`);

  // Scope to the card containing this space name, then click its own Activity button
  const card = page
    .locator('[data-testid^="card-space-"]')
    .filter({ hasText: SPACE_NAME });
  await card.waitFor({ timeout: LOGIN_TIMEOUT_MS });
  await card.getByRole("button", { name: "Activity" }).click();
  await page.waitForLoadState("networkidle");

  // Click "Analyze"
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.waitForLoadState("networkidle");

  // Give charts time to render
  await page.waitForTimeout(2000);

  // Scroll down until the bar chart is visible
  const chart = page.locator('[data-testid="chart-posting-per-person"]');
  await chart.waitFor();
  await chart.scrollIntoViewIfNeeded();

  // A bit more padding so the full chart is visible
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(1000);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(OUTPUT_DIR, `bar-chart-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  console.log(`Screenshot saved: ${screenshotPath}`);

  await context.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
