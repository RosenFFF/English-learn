import { expect, test } from '@playwright/test';

test('renders the four tabs', async ({ page }) => {
  await page.goto('/today');

  await expect(page.getByRole('tab', { name: '今天' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '词书' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '练习' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的' })).toBeVisible();

  await page.getByRole('tab', { name: '词书' }).click();
  await expect(page).toHaveURL(/\/books$/);
  // 词书页列出四级词书（数据来自浏览器端 SQLite 里的 words.db）
  await expect(page.getByTestId('book-cet4')).toBeVisible({ timeout: 60_000 });
});
