import { expect, test } from '@playwright/test';

test('renders the four tabs', async ({ page }) => {
  await page.goto('/today');

  await expect(page.getByRole('tab', { name: '今天' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '词书' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '练习' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的' })).toBeVisible();

  await page.getByRole('tab', { name: '词书' }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByText('词书里的单词列表将在后续版本接入。')).toBeVisible();
});
