// Daily Nomni Procure "Spending by SKU" (Summary) export.
// Logs in with NOMNI_EMAIL / NOMNI_PASSWORD, opens the SKU spending report,
// clicks Export -> Summary, and saves yesterday's (Singapore time) report to reports/.
//
// Optional env:
//   REPORT_DATE=YYYY-MM-DD   run for a specific day instead of yesterday
//   HEADLESS=false           watch the browser when running locally

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const EMAIL = process.env.NOMNI_EMAIL;
const PASSWORD = process.env.NOMNI_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Missing NOMNI_EMAIL or NOMNI_PASSWORD');
  process.exit(1);
}

const LOGIN_URL = 'https://buyer.zeemart.co/login';
const REPORT_URL = 'https://buyer.zeemart.co/sg/pages/reports/spending/sku';
const EXPORT_PATTERN = '**/services/reports/spendings/sku/excel/summary**';
const OUT_DIR = path.resolve('reports');
const DEBUG_DIR = path.resolve('debug');
const SGT_OFFSET_SEC = 8 * 3600; // Singapore has no daylight saving

// ---- Work out the day to export (Singapore time) ----
function targetDay() {
  if (process.env.REPORT_DATE) return process.env.REPORT_DATE;
  const nowSgt = new Date(Date.now() + SGT_OFFSET_SEC * 1000);
  nowSgt.setUTCDate(nowSgt.getUTCDate() - 1);
  return nowSgt.toISOString().slice(0, 10);
}
const day = targetDay();
const [y, m, d] = day.split('-').map(Number);
const startDate = Date.UTC(y, m - 1, d) / 1000 - SGT_OFFSET_SEC; // 00:00:00 SGT
const endDate = startDate + 86400 - 1;                           // 23:59:59 SGT
const ymd = day.replaceAll('-', '');
const outFile = path.join(OUT_DIR, `SpendingBySKU_${ymd}.xlsx`);

async function firstVisible(page, selectors, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`None of these appeared: ${selectors.join(' | ')}`);
}

const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  timezoneId: 'Asia/Singapore',
  acceptDownloads: true,
});
const page = await context.newPage();

try {
  // ---- Log in ----
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  const emailBox = await firstVisible(page, [
    'input[type="email"]', 'input[formcontrolname*="email" i]', 'input[name*="email" i]',
    'input[placeholder*="email" i]', 'input[type="text"]',
  ]);
  await emailBox.fill(EMAIL);

  // Some logins ask for the password on a second step.
  let pwBox = page.locator('input[type="password"]').first();
  if (!(await pwBox.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /continue|next|log in|login|sign in/i }).first().click();
    pwBox = await firstVisible(page, ['input[type="password"]']);
  }
  await pwBox.fill(PASSWORD);
  await page.getByRole('button', { name: /log in|login|sign in/i }).first().click();
  await page.waitForURL(/\/pages\//, { timeout: 45000 });
  console.log('Logged in');

  // ---- Capture the export file, with the date range swapped to the target day ----
  let resolveFile, rejectFile;
  const fileSaved = new Promise((res, rej) => { resolveFile = res; rejectFile = rej; });
  await context.route(EXPORT_PATTERN, async (route) => {
    try {
      const url = new URL(route.request().url());
      url.searchParams.set('startDate', String(startDate));
      url.searchParams.set('endDate', String(endDate));
      const resp = await route.fetch({ url: url.toString() });
      const body = await resp.body();
      if (resp.status() !== 200 || body.length < 100) {
        throw new Error(`Export returned HTTP ${resp.status()}, ${body.length} bytes`);
      }
      await fs.mkdir(OUT_DIR, { recursive: true });
      await fs.writeFile(outFile, body);
      await route.fulfill({ response: resp, body });
      resolveFile(body.length);
    } catch (err) {
      rejectFile(err);
      await route.abort().catch(() => {});
    }
  });

  // ---- Open report and click Export -> Summary ----
  await page.goto(REPORT_URL, { waitUntil: 'networkidle' });
  const exportBtn = await firstVisible(page, ['a.export-mclr', 'text=Export'], 45000);
  await exportBtn.click();
  await (await firstVisible(page, ['text=Summary'])).click();

  const bytes = await Promise.race([
    fileSaved,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out waiting for export')), 120000)),
  ]);
  console.log(`Saved ${outFile} (${bytes} bytes) for ${day}`);
} catch (err) {
  console.error('FAILED:', err.message);
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await page.screenshot({ path: path.join(DEBUG_DIR, 'failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
