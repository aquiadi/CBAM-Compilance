/**
 * Screenshots every screen against a running server.
 *
 *   npm run dev            # in one terminal
 *   npm run screenshots    # in another
 *
 * Signs up a throwaway account through the real UI, opens the demo plant and
 * captures each screen. Used to eyeball the design after a change: a palette
 * validator checks colour, not layout, and label collisions and overflow only
 * show up in a real browser.
 *
 * Set PLAYWRIGHT_CHROMIUM_PATH when Chromium lives somewhere Playwright does not
 * look by default (CI images that pre-install browsers, for example).
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.env.SHOT_DIR ?? "artifacts/screenshots";

const SCREENS = [
  ["/overview", "01-overview"],
  ["/ingest", "02-data"],
  ["/review", "03-review"],
  ["/calculate", "04-calculate"],
  ["/declaration", "05-declaration"],
  ["/audit", "06-audit"],
  ["/suppliers", "07-suppliers"],
  ["/evidence", "08-evidence"],
  ["/activity", "09-activity"],
  ["/methodology", "10-methodology"],
  ["/settings", "11-installation"],
  ["/settings/team", "12-team"],
];

mkdirSync(OUT, { recursive: true });

// SHOT_THEME=dark|light and SHOT_DEVICE=phone|tablet|desktop cover the
// combinations a real visitor brings; the defaults are desktop, light.
const THEME = process.env.SHOT_THEME ?? "light";
const DEVICES = {
  desktop: { viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 },
  tablet: {
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};
const DEVICE = DEVICES[process.env.SHOT_DEVICE ?? "desktop"] ?? DEVICES.desktop;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({
  ...DEVICE,
  colorScheme: THEME === "dark" ? "dark" : "light",
});
const page = await context.newPage();

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

let failures = 0;

// The landing page, then sign up through the form and open the demo.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/00-landing.png`, fullPage: true });
await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/00-signup.png`, fullPage: true });
const stamp = Date.now().toString(36);
await page.getByLabel("Your name").fill("Screenshot User");
await page.getByLabel("Work e-mail").fill(`shots-${stamp}@example.com`);
await page.getByLabel("Password").fill("screenshot password");
await page.getByLabel("Organisation").fill("Shakti Steel & Power Ltd");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL(`${BASE}/onboarding`, { timeout: 30_000 });
await page.screenshot({ path: `${OUT}/00-onboarding.png`, fullPage: true });
await page.getByRole("button", { name: "Open the demo" }).click();
await page.waitForURL(`${BASE}/overview**`, { timeout: 60_000 });

// The guided tour starts on the demo: capture its first steps, then leave it.
const tourDialog = page.getByRole("dialog");
await tourDialog.waitFor({ timeout: 15_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/00-tour-1.png` });
for (const n of [2, 3, 4, 5]) {
  await page.getByRole("button", { name: /Start the tour|Next/ }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/00-tour-${n}.png` });
}
await page.keyboard.press("Escape");
await tourDialog.waitFor({ state: "detached" });
console.log("tour: captured 5 steps and closed");

for (const [path, name] of SCREENS) {
  try {
    const response = await page.goto(`${BASE}${path}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      failures++;
      const culprits = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        return [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > w + 1)
          .filter((el) => !el.parentElement?.closest(".overflow-x-auto"))
          .slice(0, 4)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`);
      });
      console.error(`OVERFLOW ${path}: page is ${overflow}px wider than the screen`, culprits);
    }
    const status = response?.status() ?? 0;
    if (status !== 200) failures++;
    console.log(`${status} ${path.padEnd(22)} -> ${name}.png`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${path}: ${error instanceof Error ? error.message : error}`);
  }
}

// The mapping review screen for the first dataset.
await page.goto(`${BASE}/ingest`, { waitUntil: "networkidle" });
const review = page.getByRole("link", { name: /Open →|Review →/ }).first();
if (await review.count()) {
  await review.click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/02b-mapping-review.png`, fullPage: true });
  console.log(`200 ${page.url().replace(BASE, "").padEnd(22)} -> 02b-mapping-review.png`);
}

await browser.close();

if (errors.length > 0) {
  console.error(`\n${errors.length} browser error(s):`);
  for (const e of errors.slice(0, 10)) console.error(`  ${e}`);
}
process.exit(failures > 0 || errors.length > 0 ? 1 : 0);
