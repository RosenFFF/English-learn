import { expect, test } from '@playwright/test';

/**
 * 防回归：网页导出必须真正加载 JS 并由前端路由接管。
 * web.output = 'static' 时导出的 HTML 没有注入 <script>，页面看起来正常却点不动，
 * 而 Tab 是普通链接，点了会整页跳转，所以只检查「能看到标签」的用例发现不了。
 */
test.use({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });

test('首页已交互：点「开始今天」进入背词页，切换 Tab 不整页刷新', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');

  // JS 已加载：入口 bundle 在页面里，且 React 渲染出了可点击的界面
  await expect(page.locator('script[src*="/_expo/static/js/web/entry-"]')).toHaveCount(1);
  await expect(page.getByTestId('choose-book')).toBeVisible({ timeout: 60_000 });

  // 在 window 上打标记：整页刷新会把它清掉，前端路由跳转不会
  await page.evaluate(() => {
    (window as unknown as { __spaMarker?: string }).__spaMarker = 'alive';
  });
  const marker = () =>
    page.evaluate(() => (window as unknown as { __spaMarker?: string }).__spaMarker ?? null);

  // 首次使用先选词书，再回到「今天」
  await page.getByTestId('choose-book').click();
  await page.getByTestId('book-cet4').click();
  await expect(page.getByText('每日计划 · 四级词汇')).toBeVisible();
  await page.getByTestId('tab-today').click();

  // 真正点击「开始今天」，进入背词页并出现单词卡片
  const start = page.getByTestId('start-today');
  await expect(start).toHaveText(/开始今天/);
  await start.click();
  await expect(page).toHaveURL(/\/study$/);
  await expect(page.getByTestId('card-front')).toBeVisible();
  await expect(page.getByTestId('headword')).not.toBeEmpty();
  expect(await marker()).toBe('alive');

  // 关掉背词页，点底部标签切到「练习」：内容变化、URL 变化，但没有整页刷新
  await page.getByTestId('close').click();
  await expect(page.getByTestId('today-new')).toBeVisible();
  const practiceContent = page.getByText(/弱点词 \d+/);
  await expect(practiceContent).toHaveCount(0);
  await page.getByTestId('tab-practice').click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(practiceContent).toBeVisible();
  expect(await marker()).toBe('alive');
});
