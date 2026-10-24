import { expect, test } from '@playwright/test';

// 截图默认放 test-results 下（已被 .gitignore 忽略）；设 EXAM_HOME_SHOTS 可另存到别处
const SHOTS = process.env.EXAM_HOME_SHOTS ?? 'test-results/shots/exam-home';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(120_000);

test('首次启动选考试 → 六级首页 → 词汇 → 背词', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page).toHaveURL(/\/choose-exam$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: '你在准备哪门考试？' })).toBeVisible();
  await expect(page.getByText('之后可以在「我的」切换')).toBeVisible();

  // 考研、雅思即将推出：不可点，读屏能读出「即将推出」
  for (const id of ['kaoyan', 'ielts']) {
    const card = page.getByTestId(`exam-${id}`);
    await expect(card).toHaveAttribute('aria-disabled', 'true');
    await expect(card).toHaveAttribute('aria-label', /即将推出/);
  }
  await page.screenshot({ path: `${SHOTS}/01-choose-exam.png` });

  await page.getByTestId('exam-cet6').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('home-exam')).toHaveText('大学英语六级');
  for (const title of ['词汇', '阅读', '翻译', '写作', '听力', '错题本'])
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  // 没有在学词书时自动选上六级词书，每天 20 个新词
  await expect(page.getByTestId('home-vocab-new')).toHaveText('新词 20');
  await expect(page.getByTestId('home-vocab-review')).toHaveText('待复习 0');
  await page.screenshot({ path: `${SHOTS}/02-cet6-home.png` });

  // 未上线板块：占位页说明这个板块练什么，返回首页
  await page.getByTestId('section-translation').click();
  await expect(page).toHaveURL(/\/section\/translation$/);
  await expect(page.getByTestId('section-page-translation')).toContainText('汉译英');
  await page.getByTestId('section-back').click();
  await expect(page).toHaveURL(/\/home$/);

  // 词汇 → 背一张
  await page.getByTestId('section-vocab').click();
  await expect(page).toHaveURL(/\/vocab$/);
  await expect(page.getByTestId('today-new')).toContainText('20');
  await expect(page.getByText(/六级 · 六级词汇/)).toBeVisible();
  await page.getByTestId('start-today').click();
  await expect(page).toHaveURL(/\/study$/);
  await page.getByTestId('flip').click();
  await expect(page.getByTestId('meanings')).toBeVisible();
  await page.getByTestId('rate-good').click();
  await page.getByTestId('close').click();
  await expect(page).toHaveURL(/\/vocab$/);
  await expect(page.getByTestId('today-new')).toContainText('19');

  // 刷新后不再出现选考试页，直接进首页
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/, { timeout: 60_000 });

  expect(errors).toEqual([]);
});

test('从首页和「我的」切换考试，选完回到原来那页', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/home$/);

  // 首页右上角「切换」
  await page.getByTestId('switch-exam').click();
  await expect(page).toHaveURL(/\/choose-exam\?from=home$/);
  await expect(page.getByTestId('exam-cet6')).toHaveAttribute('aria-label', /当前考试/);
  await page.getByTestId('exam-cet6').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByTestId('home-exam')).toHaveText('大学英语六级');

  // 「我的」里的当前考试行走同一个入口
  await page.getByTestId('tab-me').click();
  await expect(page).toHaveURL(/\/me$/);
  const row = page.getByTestId('me-switch-exam');
  await expect(row).toContainText('当前考试：六级');
  await page.screenshot({ path: `${SHOTS}/03-me-exam-row.png` });
  await row.click();
  await expect(page).toHaveURL(/\/choose-exam\?from=me$/);
  await page.getByTestId('exam-cet6').click();
  await expect(page).toHaveURL(/\/me$/);

  // 不认识的板块 id 显示找不到页面
  await page.goto('/section/today');
  await expect(page.getByTestId('section-not-found')).toBeVisible({ timeout: 60_000 });
});
