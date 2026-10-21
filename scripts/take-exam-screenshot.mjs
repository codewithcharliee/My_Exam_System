import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const screenshotPath = path.resolve(
  scriptDirectory,
  '..',
  'components',
  'exam',
  '__screenshots__',
  'bingham-exam-layout-proof.png',
);

await mkdir(path.dirname(screenshotPath), { recursive: true });

const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const response = await page.goto('http://localhost:3000/exam/test-attempt-id', {
    waitUntil: 'networkidle',
    timeout: 30_000,
  });

  if (!response?.ok()) {
    throw new Error(
      `Exam page request failed${response ? ` with HTTP ${response.status()}` : ''}.`,
    );
  }

  await page.locator('body').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Saved full-page exam screenshot to ${screenshotPath}`);
} finally {
  await browser.close();
}
