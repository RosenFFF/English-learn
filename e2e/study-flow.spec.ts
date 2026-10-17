import { expect, test, type Page } from '@playwright/test';

// 截图放在 test-results 下（已被 .gitignore 忽略），用于给老板看调试成果
const SHOTS = 'test-results/shots';

// 手机尺寸 + 中国时区：「今天」按本地日期计算
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(180_000);
const MOCK_LLM = 'https://llm.mock.test/v1';

const AI_TEXT = `### 核心含义
- **v. 放弃，抛弃**：最常考，指彻底放弃计划、习惯或人
- n. 放纵：常见于短语 with abandon

### 记忆方法
a（加强）+ band（约束）+ on → 解除约束 → 放弃

### 例句
1. They had to **abandon** the plan because of the storm. 因为暴风雨，他们不得不放弃这个计划。
2. Never **abandon** hope. 永远不要放弃希望。`;

async function mockLlm(page: Page): Promise<void> {
  await page.route(`${MOCK_LLM}/**`, async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    const isTest = body.messages.some((m) => m.content.includes('只回复 OK'));
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content: isTest ? 'OK' : AI_TEXT } }] }),
    });
  });
}

test('完整背词流程（网页版）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await mockLlm(page);

  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  // 1. 首次进入：选择词书
  await page.getByTestId('choose-book').click({ timeout: 60_000 });
  await page.getByTestId('book-cet4').click();
  await expect(page.getByText('每日计划 · 四级词汇')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-books.png` });

  // 2. 大模型设置（用拦截的假接口测试连接）
  await page.getByTestId('tab-me').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('llm-base-url').fill(MOCK_LLM);
  await page.getByTestId('llm-api-key').fill('sk-test-not-real');
  await page.getByTestId('llm-model').fill('mock-model');
  await page.getByTestId('llm-test').click();
  await expect(page.getByText(/连接成功/)).toBeVisible();
  await page.getByTestId('llm-save').click();
  await expect(page.getByText(/已保存/)).toBeVisible();
  await page.getByTestId('llm-api-key').blur();
  await page.screenshot({ path: `${SHOTS}/05-settings.png` });
  await page.goBack();

  // 3. 今天
  await page.getByTestId('tab-today').click();
  await expect(page.getByTestId('today-new')).toContainText('20');
  await page.screenshot({ path: `${SHOTS}/01-today.png` });

  // 4. 背一组
  await page.getByTestId('start-today').click();
  await expect(page.getByTestId('headword')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-card-front.png` });
  await page.getByTestId('flip').click();
  await expect(page.getByTestId('meanings')).toBeVisible();
  await page.waitForTimeout(250); // 翻面淡入 150ms
  await page.screenshot({ path: `${SHOTS}/03-card-back.png` });
  await page.getByTestId('ai-explain').click();
  await expect(page.getByText('记忆方法')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03b-card-back-ai.png`, fullPage: false });

  const pattern = ['again', 'good', 'hard', 'good', 'easy', 'good'] as const;
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('done').isVisible()) break;
    if (await page.getByTestId('flip').isVisible()) {
      // 交替用按钮和快捷键翻面
      if (i % 2) await page.keyboard.press('Space');
      else await page.getByTestId('flip').click();
    }
    // 第二轮遇到「忘了」的词时给「认识」，保证能结束
    const rating = i < pattern.length ? pattern[i] : 'good';
    await page.getByTestId(`rate-${rating}`).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="done"],[data-testid="flip"]') !== null,
    );
  }
  await expect(page.getByText('今日打卡成功！')).toBeVisible();
  await page.waitForTimeout(1300); // 等庆祝动画放完
  await page.screenshot({ path: `${SHOTS}/06-done.png` });

  // 5. 回到今天：打卡和进度更新
  await page.getByTestId('back-today').click();
  await expect(page.getByTestId('streak')).toContainText('1 天');
  await page.screenshot({ path: `${SHOTS}/07-today-after.png` });

  await page.getByTestId('tab-practice').click();
  await expect(page.getByText(/弱点词 \d+/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-practice.png` });
  await page.getByTestId('tab-me').click();
  await expect(page.getByText('已学单词')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-me.png` });

  // 6. 暗色（跟随系统）；先把每日新词调到 30，今天还能再学 10 个
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('tab-books').click();
  await page.getByRole('radio', { name: '每日新词：30' }).click();
  await page.getByTestId('tab-today').click();
  await expect(page.getByTestId('today-new')).toContainText('10');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/10-dark-today.png` });
  await page.getByTestId('start-today').click();
  await page.getByTestId('flip').click();
  await expect(page.getByTestId('meanings')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/11-dark-card-back.png` });

  // 7. 刷新后进度仍在（OPFS 持久化）
  await page.goto('/today');
  await expect(page.getByTestId('streak')).toContainText('1 天', { timeout: 60_000 });

  expect(errors.filter((e) => !/speech|voices/i.test(e))).toEqual([]);
});
