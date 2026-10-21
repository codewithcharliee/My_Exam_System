import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page has no critical or serious axe accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).analyze();
  const criticalViolations = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  );

  expect(criticalViolations).toEqual([]);
});
