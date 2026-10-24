import { expect, test } from '@playwright/test';

test('renders the two tabs', async ({ page }) => {
  await page.goto('/');
  // 首次启动先选考试
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/home$/);

  await expect(page.getByRole('tab', { name: '首页' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '我的' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(2);

  await page.getByRole('tab', { name: '我的' }).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByTestId('me-switch-exam')).toContainText('当前考试：六级');

  // 词书页搬到了「词汇」板块下面（数据来自浏览器端 SQLite 里的 words.db）
  await page.goto('/vocab/books');
  await expect(page.getByTestId('book-cet4')).toBeVisible({ timeout: 60_000 });
});
