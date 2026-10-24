import { expect, test, type Page } from '@playwright/test';

import {
  asModelOutput,
  DEMO_ESSAY,
  DEMO_ESSAY_FEEDBACK,
  DEMO_TRANSLATION,
  DEMO_TRANSLATION_FEEDBACK,
  SAMPLE_ESSAY_ANSWER,
  SAMPLE_TRANSLATION_ANSWER,
  STRESS_ANSWER,
  STRESS_ESSAY,
  STRESS_ESSAY_FEEDBACK,
  STRESS_TRANSLATION,
  STRESS_TRANSLATION_FEEDBACK,
} from '../src/lib/exam/__testutils__/subjective-fixtures';

// 截图默认放 test-results 下（已被 .gitignore 忽略）；设 SUBJECTIVE_SHOTS 可另存到别处
const SHOTS = process.env.SUBJECTIVE_SHOTS ?? 'test-results/shots/translation-writing';
const MOCK_LLM = 'https://llm.mock.test/v1';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(120_000);

type Kind = 'gen-translation' | 'gen-essay' | 'grade-translation' | 'grade-essay';
const MARK: Record<Kind, string> = {
  'gen-translation': '题型：段落翻译（汉译英）',
  'gen-essay': '题型：写作。',
  'grade-translation': '学生译文',
  'grade-essay': '学生作文',
};

interface MockLlm {
  prompts: { kind: Kind; text: string }[];
  /** 接下来 n 次评分请求返回不合格的内容 */
  failGrades: (n: number) => void;
  /** 设了之后评分请求先挂住，直到调用返回的函数 */
  holdGrades: () => () => void;
}

/** 模拟大模型：出题、评分都返回 __testutils__ 里的原创测试数据（评分结果符合 v2 点评 schema） */
async function mockLlm(page: Page, stress = false): Promise<MockLlm> {
  const prompts: MockLlm['prompts'] = [];
  let failing = 0;
  let gate: Promise<void> | null = null;
  const reply: Record<Kind, unknown> = stress
    ? {
        'gen-translation': STRESS_TRANSLATION,
        'gen-essay': STRESS_ESSAY,
        'grade-translation': asModelOutput(STRESS_TRANSLATION_FEEDBACK),
        'grade-essay': asModelOutput(STRESS_ESSAY_FEEDBACK),
      }
    : {
        'gen-translation': DEMO_TRANSLATION,
        'gen-essay': DEMO_ESSAY,
        'grade-translation': asModelOutput(DEMO_TRANSLATION_FEEDBACK),
        'grade-essay': asModelOutput(DEMO_ESSAY_FEEDBACK),
      };
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
    let content = 'OK';
    if (kind) {
      if (user.length === 1) prompts.push({ kind, text: user[0]! });
      const grading = kind.startsWith('grade');
      if (grading && gate) await gate;
      if (grading && failing > 0) {
        failing--;
        content = '抱歉，我现在没法评分。';
      } else content = JSON.stringify(reply[kind]);
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });
  return {
    prompts,
    failGrades: (n) => {
      failing = n;
    },
    holdGrades: () => {
      let release = () => {};
      gate = new Promise<void>((r) => {
        release = () => {
          gate = null;
          r();
        };
      });
      return () => release();
    },
  };
}

async function toHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/home$/);
}

/** 网页版密钥只在内存里：之后都在 App 内跳转，不能刷新页面 */
async function fillLlmSettings(page: Page): Promise<void> {
  await page.getByTestId('llm-base-url').fill(MOCK_LLM);
  await page.getByTestId('llm-api-key').fill('sk-test-not-real');
  await page.getByTestId('llm-model').fill('mock-model');
  await page.getByTestId('llm-save').click();
  await expect(page.getByText(/已保存/).first()).toBeVisible();
}

async function toHomeConfigured(page: Page): Promise<void> {
  await toHome(page);
  await page.getByTestId('tab-me').click();
  await page.getByTestId('open-settings').click();
  await fillLlmSettings(page);
  await page.goBack();
  await page.getByTestId('tab-home').click();
  await expect(page).toHaveURL(/\/home$/);
}

/** 下一个 window.confirm：检查标题，按 accept 决定确定还是取消 */
function nextConfirm(page: Page, title: RegExp, accept: boolean): Promise<void> {
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

test('首页 → 翻译 → 输入译文 → 交卷 → 看到判分（分项点评、改写示例）；再来一题避开刚才的话题', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const llm = await mockLlm(page);
  await toHomeConfigured(page);
  await expect(page.getByTestId('section-translation')).toContainText('大模型评分');
  await page.getByTestId('section-translation').click();
  await expect(page).toHaveURL(/\/translation$/);
  await expect(page.getByTestId('translation-source')).toContainText('高速铁路网', {
    timeout: 30_000,
  });
  expect(llm.prompts.map((x) => x.kind)).toEqual(['gen-translation']);
  expect(llm.prompts[0]!.text).not.toContain('避开以下话题');

  const input = page.getByTestId('translation-input');
  await expect(input).toHaveAttribute('maxlength', '2000');
  expect(
    await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await input.fill(SAMPLE_TRANSLATION_ANSWER);
  await expect(page.getByTestId('translation-words')).toHaveText(/^\d+ 词$/);
  await expect(page.getByTestId('translation-draft')).toHaveText('草稿已保存');
  await input.blur();
  await page.screenshot({ path: `${SHOTS}/01-translation-answering.png` });

  // 交卷：先取消一次留在原页，再确认；评分中有加载态
  let confirm = nextConfirm(page, /交卷评分/, false);
  await page.getByTestId('translation-submit').click();
  await confirm;
  await expect(input).toBeVisible();
  const release = llm.holdGrades();
  confirm = nextConfirm(page, /交卷评分/, true);
  await page.getByTestId('translation-submit').click();
  await confirm;
  await expect(page.getByTestId('translation-grading')).toContainText('正在评分');
  release();

  await expect(page.getByTestId('translation-score')).toContainText('10', { timeout: 30_000 });
  await expect(page.getByTestId('translation-score')).toContainText('/ 15');
  await expect(page.getByTestId('translation-band')).toHaveText('11 分档');
  await expect(page.getByTestId('translation-pass')).toHaveText('达标');
  await expect(page.getByTestId('translation-dimensions')).toContainText('忠实原文');
  await expect(page.getByTestId('translation-criterion-grammar')).toContainText('薄弱');
  await expect(page.getByTestId('translation-rewrite')).toContainText('Over the past twenty years');
  await expect(page.getByTestId('translation-saved')).toHaveText('已保存到练习记录');
  await page.getByTestId('translation-dimensions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/02-translation-graded.png` });
  await page.getByTestId('translation-rewrite').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/02b-translation-graded-rewrite.png` });

  // 再来一题：刚才那道已做过，重新出题，提示词里带上它的话题
  await page.getByTestId('translation-next').click();
  await expect(page.getByTestId('translation-input')).toHaveValue('', { timeout: 30_000 });
  const gens = llm.prompts.filter((x) => x.kind === 'gen-translation');
  expect(gens).toHaveLength(2);
  expect(gens[1]!.text).toContain('避开以下话题');
  expect(gens[1]!.text).toContain(JSON.stringify(DEMO_TRANSLATION.topic));
  expect(errors).toEqual([]);
});

test('首页 → 写作：草稿自动保存、退出再进来恢复；篇幅不足时提醒；判分待重练', async ({ page }) => {
  const llm = await mockLlm(page);
  await toHomeConfigured(page);
  await page.getByTestId('section-writing').click();
  await expect(page.getByTestId('writing-title')).toHaveText(DEMO_ESSAY.title, { timeout: 30_000 });
  await expect(page.getByTestId('writing-progress')).toHaveText('0 / 150–200 词');

  const firstPara = SAMPLE_ESSAY_ANSWER.split('\n\n')[0]!;
  await page.getByTestId('writing-input').fill(firstPara);
  await expect(page.getByTestId('writing-draft')).toHaveText('草稿已保存');
  await page.getByTestId('writing-close').click();
  await expect(page).toHaveURL(/\/home$/);

  // 再进来：同一道题、恢复草稿，不再出新题
  await page.getByTestId('section-writing').click();
  await expect(page.getByTestId('writing-restored')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('writing-input')).toHaveValue(firstPara);
  expect(llm.prompts.filter((x) => x.kind === 'gen-essay')).toHaveLength(1);

  await page.getByTestId('writing-input').fill(SAMPLE_ESSAY_ANSWER);
  await expect(page.getByTestId('writing-words')).toHaveText(/^\d+ 词$/);
  await page.getByTestId('writing-input').blur();
  await page.screenshot({ path: `${SHOTS}/03-writing-answering.png` });

  const confirm = nextConfirm(page, /只写了 \d+ 词/, true);
  await page.getByTestId('writing-submit').click();
  await confirm;
  await expect(page.getByTestId('writing-score')).toContainText('8', { timeout: 30_000 });
  await expect(page.getByTestId('writing-redo')).toHaveText('待重练');
  await expect(page.getByTestId('writing-band')).toHaveText('8 分档');
  await expect(page.getByTestId('writing-dimensions')).toContainText('结构与衔接');
  await expect(page.getByTestId('writing-rewrite')).toContainText('an increasing number');
  await page.getByTestId('writing-dimensions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/04-writing-graded.png` });
  await page.getByTestId('writing-rewrite').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/04b-writing-graded-rewrite.png` });

  // 交卷后草稿清掉：完成后再进来是新题
  await page.getByTestId('writing-done').click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId('section-writing').click();
  await expect(page.getByTestId('writing-input')).toHaveValue('', { timeout: 30_000 });
  await expect(page.getByTestId('writing-restored')).toHaveCount(0);
  expect(llm.prompts.filter((x) => x.kind === 'gen-essay')).toHaveLength(2);
});

test('没配大模型：提示并能去设置页，填好回来自动出题', async ({ page }) => {
  await mockLlm(page);
  await toHome(page);
  await page.getByTestId('section-writing').click();
  await expect(page.getByTestId('writing-unconfigured')).toContainText(
    '还缺：接口地址、密钥、模型名',
  );
  await page.screenshot({ path: `${SHOTS}/05-unconfigured.png` });
  await page.getByTestId('writing-go-settings').click();
  await expect(page).toHaveURL(/\/settings$/);
  await fillLlmSettings(page);
  await page.goBack();
  await expect(page.getByTestId('writing-title')).toBeVisible({ timeout: 30_000 });
});

test('判分失败：显示中文原因，草稿保留，点重试评分成功', async ({ page }) => {
  const llm = await mockLlm(page);
  await toHomeConfigured(page);
  await page.getByTestId('section-translation').click();
  await page.getByTestId('translation-input').fill(SAMPLE_TRANSLATION_ANSWER, { timeout: 30_000 });
  llm.failGrades(3); // 第一次加两次纠正都不是 JSON
  const confirm = nextConfirm(page, /交卷评分/, true);
  await page.getByTestId('translation-submit').click();
  await confirm;
  await expect(page.getByTestId('translation-grade-error-message')).toContainText('评分', {
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SHOTS}/06-grade-error.png` });
  await page.getByTestId('translation-retry-grade').click();
  await expect(page.getByTestId('translation-score')).toContainText('10', { timeout: 30_000 });
});

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });
  test('翻译作答中', async ({ page }) => {
    await mockLlm(page);
    await toHomeConfigured(page);
    await page.getByTestId('section-translation').click();
    await page
      .getByTestId('translation-input')
      .fill(SAMPLE_TRANSLATION_ANSWER, { timeout: 30_000 });
    await expect(page.getByTestId('translation-draft')).toHaveText('草稿已保存');
    await page.getByTestId('translation-input').blur();
    await page.screenshot({ path: `${SHOTS}/07-translation-dark.png` });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});

test.describe('压测：360 宽、超长原文 / 作答 / 点评', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('翻译和写作都不横向溢出', async ({ page }) => {
    await mockLlm(page, true);
    await toHomeConfigured(page);
    await noHorizontalOverflow(page);

    await page.getByTestId('section-translation').click();
    await page.getByTestId('translation-input').fill(STRESS_ANSWER, { timeout: 30_000 });
    await noHorizontalOverflow(page);
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('translation-submit').click();
    await expect(page.getByTestId('translation-rewrite')).toBeVisible({ timeout: 30_000 });
    await noHorizontalOverflow(page);
    await page.getByTestId('translation-dimensions').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/08-stress-translation-360.png` });
    await page.getByTestId('translation-done').click();

    await page.getByTestId('section-writing').click();
    await page.getByTestId('writing-input').fill(STRESS_ANSWER, { timeout: 30_000 });
    await noHorizontalOverflow(page);
    await page.getByTestId('writing-input').blur();
    await page.screenshot({ path: `${SHOTS}/09-stress-writing-360.png` });
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('writing-submit').click();
    await expect(page.getByTestId('writing-rewrite')).toBeVisible({ timeout: 30_000 });
    await noHorizontalOverflow(page);
  });
});
