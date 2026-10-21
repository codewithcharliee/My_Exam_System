import { chromium } from 'playwright';

(async () => {
  // Launch Playwright Chromium
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Navigate to your running exam page
  await page.goto('http://localhost:3000/exam/test-attempt-id');

  // Capture full page screenshot
  await page.screenshot({ path: 'components/exam/__screenshots__/bingham-exam-layout.png', fullPage: true });

  console.log('Successfully captured full-page exam screenshot!');
  await browser.close();
})();