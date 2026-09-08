/**
 * Screenshots every screen against a running dev server.
 *
 *   npm run dev            # in one terminal
 *   npm run screenshots    # in another
 *
 * Used to eyeball the design after a change: a palette validator checks colour,
 * not layout, and label collisions and overflow only show up in a real browser.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH when Chromium lives somewhere Playwright does not
 * look by default (CI images that pre-install browsers, for example).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SHOT_DIR ?? "artifacts/screenshots";

const SCREENS = [
  ["/", "01-overview"],
  ["/ingest", "02-ingest"],
  ["/review", "03-review"],
  ["/calculate", "04-calculate"],
  ["/declaration", "05-declaration"],
  ["/audit", "06-audit"],
  ["/methodology", "07-methodology"],
];

mkdirSync(OUT, { recursive: true });

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

let failures = 0;
for (const [path, name] of SCREENS) {
  try {
    const response = await page.goto(`${BASE}${path}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const status = response?.status() ?? 0;
    if (status !== 200) failures++;
    console.log(`${status} ${path.padEnd(14)} -> ${name}.png`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} console error(s):`);
  for (const e of errors.slice(0, 10)) console.error(`  ${e}`);
  failures++;
}

await browser.close();
process.exit(failures > 0 ? 1 : 0);
