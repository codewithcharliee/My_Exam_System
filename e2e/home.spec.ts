import { expect, test } from '@playwright/test';

test('home page opens the candidate and staff portals', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Examination System' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Student Portal' })).toHaveAttribute('href', '/login/student');
  await expect(page.getByRole('link', { name: 'Admin Portal' })).toHaveAttribute('href', '/login/admin');

  await page.goto('/login/student');
  await expect(page.getByRole('heading', { name: 'Student Portal' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
});
