import { expect, test, type Page } from '@playwright/test';

import { DEMO_MATCHING, stressReadingSet } from '../src/lib/exam/__testutils__/reading-fixtures';
import {
  asModelOutput,
  DEMO_ESSAY,
  DEMO_ESSAY_FEEDBACK,
  SAMPLE_ESSAY_ANSWER,
} from '../src/lib/exam/__testutils__/subjective-fixtures';

// 截图默认放 test-results 下（已被 .gitignore 忽略）；设 MISTAKES_SHOTS 可另存到别处
const SHOTS = process.env.MISTAKES_SHOTS ?? 'test-results/shots/mistakes';
const MOCK_LLM = 'https://llm.mock.test/v1';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(120_000);

type Kind = 'gen-matching' | 'gen-cloze' | 'gen-essay' | 'grade-essay';
const MARK: Record<Kind, string> = {
  'gen-matching': '长篇阅读（段落信息匹配）',
  'gen-cloze': '选词填空（Banked Cloze）',
  'gen-essay': '题型：写作。',
  'grade-essay': '学生作文',
};

interface MockLlm {
  prompts: Kind[];
  /** 之后的写作评分返回这个分数 */
  setEssayScore: (n: number) => void;
}

/** 模拟大模型：出题返回 __testutils__ 里的原创测试题，评分按 setEssayScore 的分数返回 */
async function mockLlm(page: Page, stress = false): Promise<MockLlm> {
  const prompts: Kind[] = [];
  let essayScore = DEMO_ESSAY_FEEDBACK.score;
  await page.route(`${MOCK_LLM}/**`, async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = route.request().postDataJSON() as {
      messages: { role: string; content: string }[];
    };
    const user = body.messages.filter((m) => m.role === 'user').map((m) => m.content);
    const kind = (Object.keys(MARK) as Kind[]).find((k) => user[0]?.includes(MARK[k]));
    let content: unknown = 'OK';
    if (kind) {
      if (user.length === 1) prompts.push(kind);
      content =
        kind === 'gen-matching'
          ? stress
            ? stressReadingSet('matching').parts[0]!.payload
            : DEMO_MATCHING
          : kind === 'gen-cloze'
            ? stressReadingSet('banked_cloze').parts[0]!.payload
            : kind === 'gen-essay'
              ? DEMO_ESSAY
              : asModelOutput({ ...DEMO_ESSAY_FEEDBACK, score: essayScore });
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        choices: [
          { message: { content: typeof content === 'string' ? content : JSON.stringify(content) } },
        ],
      }),
    });
  });
  return {
    prompts,
    setEssayScore: (n) => {
      essayScore = n;
    },
  };
}

async function toHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/home$/);
}

/** 网页版密钥只在内存里：之后都在 App 内跳转，不能刷新页面 */
async function toHomeConfigured(page: Page): Promise<void> {
  await toHome(page);
  await page.getByTestId('tab-me').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('llm-base-url').fill(MOCK_LLM);
  await page.getByTestId('llm-api-key').fill('sk-test-not-real');
  await page.getByTestId('llm-model').fill('mock-model');
  await page.getByTestId('llm-save').click();
  await expect(page.getByText(/已保存/).first()).toBeVisible();
  await page.goBack();
  await page.getByTestId('tab-home').click();
  await expect(page).toHaveURL(/\/home$/);
}

function nextConfirm(page: Page, title: RegExp, accept = true): Promise<void> {
  return new Promise((resolve, reject) => {
    page.once('dialog', (d) => {
      try {
        expect(d.message()).toMatch(title);
        resolve(accept ? d.accept() : d.dismiss());
      } catch (e) {
        void d.dismiss();
        reject(e);
      }
    });
  });
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return {
      scroll: document.documentElement.scrollWidth - w,
      ids: [...document.querySelectorAll('[data-testid]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .filter((el) => el.getBoundingClientRect().right > w + 0.5)
        .map((el) => el.getAttribute('data-testid')),
    };
  });
  expect(over).toEqual({ scroll: 0, ids: [] });
}

/** 首页 → 阅读 → 长篇阅读：一题都不答直接交卷（10 题全错），回到首页 */
async function failMatching(page: Page): Promise<void> {
  await page.getByTestId('section-reading').click();
  await page.getByTestId('reading-type-matching').click();
  await expect(page.getByTestId('para-A')).toBeVisible({ timeout: 30_000 });
  const confirm = nextConfirm(page, /还有 10 题没答/);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-saved')).toHaveText('已保存到练习记录');
  await page.getByTestId('reading-done').click();
  await expect(page).toHaveURL(/\/reading$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
}

/** 首页 → 写作：交一篇（分数由 mock 决定），回到首页 */
async function submitEssay(page: Page): Promise<void> {
  await page.getByTestId('section-writing').click();
  await expect(page.getByTestId('writing-title')).toHaveText(DEMO_ESSAY.title, { timeout: 30_000 });
  await page.getByTestId('writing-input').fill(SAMPLE_ESSAY_ANSWER);
  const confirm = nextConfirm(page, /交卷评分|只写了/);
  await page.getByTestId('writing-submit').click();
  await confirm;
  await expect(page.getByTestId('writing-redo')).toHaveText('待重练', { timeout: 30_000 });
  await page.getByTestId('writing-done').click();
  await expect(page).toHaveURL(/\/home$/);
}

/** 屏幕上第一条错题的 testID（mistake-<题目 id>） */
async function firstItemId(page: Page, section: string): Promise<string> {
  const id = await page
    .getByTestId(`mistake-group-${section}`)
    .locator('[data-testid^="mistake-"][role="button"]')
    .first()
    .getAttribute('data-testid');
  return id!.replace(/^mistake-/, '');
}

test('空状态：还没做错过题时，错题本给出说明和去做阅读的入口', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await toHome(page);
  const card = page.getByTestId('section-mistakes');
  await expect(card).toContainText('错题 · 待重练');
  await expect(card).not.toContainText('即将上线');
  await card.click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId('mistakes-empty')).toContainText('现在没有要重做的题');
  await expect(page.getByTestId('mistakes-empty')).toContainText('低于 9 分');
  await page.screenshot({ path: `${SHOTS}/02-empty.png` });
  await page.getByTestId('mistakes-go-reading').click();
  await expect(page).toHaveURL(/\/reading$/);
  expect(errors).toEqual([]);
});

test('阅读做错、写作 8 分 → 错题本分组列出 → 重做原题通过后从列表消失', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const llm = await mockLlm(page);
  await toHomeConfigured(page);
  await failMatching(page);
  await submitEssay(page);

  await page.getByTestId('section-mistakes').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId('mistakes-summary')).toContainText('共 2 道');
  const reading = page.getByTestId('mistake-group-reading');
  const writing = page.getByTestId('mistake-group-writing');
  await expect(reading).toContainText('长篇阅读（段落匹配）');
  await expect(reading).toContainText(DEMO_MATCHING.title);
  await expect(reading).toContainText('错 10 题');
  await expect(reading).toContainText('上次错 10 题 · 共 10 题');
  await expect(writing).toContainText('待重练');
  await expect(writing).toContainText('上次 8 / 15 分');
  await expect(writing).toContainText(DEMO_ESSAY.title);
  // 阅读在写作前面（按首页板块顺序）
  const [ry, wy] = await Promise.all([
    reading.evaluate((el) => el.getBoundingClientRect().top),
    writing.evaluate((el) => el.getBoundingClientRect().top),
  ]);
  expect(ry).toBeLessThan(wy);
  await page.screenshot({ path: `${SHOTS}/01-list.png` });

  // 卡片触控区域 ≥ 44pt，正文字号 ≥ 16
  const matchingId = await firstItemId(page, 'reading');
  const card = page.getByTestId(`mistake-${matchingId}`);
  const box = await card.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const size = await reading
    .getByText(DEMO_MATCHING.title)
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);

  // 重做阅读：原题（不出新题），全部答对
  const gens = llm.prompts.filter((k) => k.startsWith('gen')).length;
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/reading/matching\\?redo=${matchingId}$`));
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 0/10', { timeout: 30_000 });
  await expect(page.getByText('重做 · 长篇阅读')).toBeVisible();
  await page.getByTestId('segment-题目').click();
  const answers = DEMO_MATCHING.statements.map((s) => s.answer);
  for (const [i, a] of answers.slice(0, 6).entries())
    await page.getByTestId(`match-${i + 1}-${a}`).click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 6/10');
  await page.screenshot({ path: `${SHOTS}/03-redo-answering.png` });
  for (const [i, a] of answers.slice(6).entries())
    await page.getByTestId(`match-${i + 7}-${a}`).click();
  const confirm = nextConfirm(page, /提交答案/);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-progress')).toHaveText('答对 10/10');
  await expect(page.getByTestId('reading-saved')).toHaveText('已保存 · 重做通过，已从错题本移出');
  await page.screenshot({ path: `${SHOTS}/04-redo-passed.png` });
  expect(llm.prompts.filter((k) => k.startsWith('gen')).length).toBe(gens);
  await page.getByTestId('reading-done').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId(`mistake-${matchingId}`)).toHaveCount(0);
  await expect(page.getByTestId('mistake-group-reading')).toHaveCount(0);
  await expect(page.getByTestId('mistakes-summary')).toContainText('共 1 道');

  // 写作重做：先还是 8 分（留在错题本），再 12 分（移出）
  const essayId = await firstItemId(page, 'writing');
  await page.getByTestId(`mistake-${essayId}`).click();
  await expect(page).toHaveURL(new RegExp(`/writing\\?redo=${essayId}$`));
  await expect(page.getByTestId('writing-title')).toHaveText(DEMO_ESSAY.title, { timeout: 30_000 });
  await expect(page.getByText('重做 · 写作')).toBeVisible();
  await expect(page.getByTestId('writing-input')).toHaveValue('');
  await page.getByTestId('writing-input').fill(SAMPLE_ESSAY_ANSWER);
  let c = nextConfirm(page, /交卷评分|只写了/);
  await page.getByTestId('writing-submit').click();
  await c;
  await expect(page.getByTestId('writing-saved')).toHaveText(
    '已保存 · 还没到 9 分，先留在错题本里',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('writing-next')).toHaveCount(0);
  await page.getByTestId('writing-done').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId(`mistake-detail-${essayId}`)).toContainText('做错过 2 次');

  llm.setEssayScore(12);
  await page.getByTestId(`mistake-${essayId}`).click();
  await expect(page.getByTestId('writing-title')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('writing-input').fill(SAMPLE_ESSAY_ANSWER);
  c = nextConfirm(page, /交卷评分|只写了/);
  await page.getByTestId('writing-submit').click();
  await c;
  await expect(page.getByTestId('writing-saved')).toHaveText('已保存 · 重做通过，已从错题本移出', {
    timeout: 30_000,
  });
  await page.getByTestId('writing-done').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
  // 只出过最开始那两道题，重做都没有调大模型出题
  expect(llm.prompts.filter((k) => k.startsWith('gen'))).toEqual(['gen-matching', 'gen-essay']);
  expect(errors).toEqual([]);
});

test('打不开的重做链接：显示中文原因和返回按钮，不崩溃', async ({ page }) => {
  await toHome(page);
  await page.getByTestId('section-mistakes').click();
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
  await page.goto('/reading/matching?redo=missing');
  await expect(page.getByTestId('reading-error-message')).toHaveText(
    '找不到这道题，可能已经被清除了',
    { timeout: 60_000 },
  );
  await expect(page.getByText('这道题打不开')).toBeVisible();
  await expect(page.getByTestId('reading-retry-generate')).toHaveCount(0);
  await page.getByTestId('reading-error-back').click();
  await expect(page).toHaveURL(/\/mistakes$/);
});

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });
  test('错题本列表', async ({ page }) => {
    await mockLlm(page);
    await toHomeConfigured(page);
    await failMatching(page);
    await submitEssay(page);
    await page.getByTestId('section-mistakes').click();
    await expect(page.getByTestId('mistake-group-writing')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/05-list-dark.png` });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});

test.describe('压测：360 宽、超长单词', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('列表和重做页都不横向溢出', async ({ page }) => {
    await mockLlm(page, true);
    await toHome(page);
    await page.getByTestId('section-mistakes').click();
    await expect(page.getByTestId('mistakes-empty')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.goBack();
    // 配好大模型，做一套压测用的选词填空和段落匹配（都不答）
    await page.getByTestId('tab-me').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('llm-base-url').fill(MOCK_LLM);
    await page.getByTestId('llm-api-key').fill('sk-test-not-real');
    await page.getByTestId('llm-model').fill('mock-model');
    await page.getByTestId('llm-save').click();
    await page.goBack();
    await page.getByTestId('tab-home').click();
    await page.getByTestId('section-reading').click();
    for (const t of ['banked_cloze', 'matching']) {
      await page.getByTestId(`reading-type-${t}`).click();
      await expect(page.getByTestId('reading-submit')).toBeVisible({ timeout: 30_000 });
      const confirm = nextConfirm(page, /没答/);
      await page.getByTestId('reading-submit').click();
      await confirm;
      await expect(page.getByTestId('reading-saved')).toHaveText('已保存到练习记录');
      await page.getByTestId('reading-done').click();
      await expect(page).toHaveURL(/\/reading$/);
    }
    await page.goBack();
    await page.getByTestId('section-mistakes').click();
    await expect(page.getByTestId('mistakes-summary')).toContainText('共 2 道');
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/06-stress-360.png` });
    const id = await firstItemId(page, 'reading');
    await page.getByTestId(`mistake-${id}`).click();
    await expect(page.getByTestId('reading-submit')).toBeVisible({ timeout: 30_000 });
    await noHorizontalOverflow(page);
  });
});
