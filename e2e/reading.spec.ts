import { expect, test, type Page } from '@playwright/test';

import {
  DEMO_BANKED_CLOZE,
  DEMO_CAREFUL,
  DEMO_MATCHING,
  stressReadingSet,
} from '../src/lib/exam/__testutils__/reading-fixtures';

// 截图默认放 test-results 下（已被 .gitignore 忽略）；设 READING_SHOTS 可另存到别处
const SHOTS = process.env.READING_SHOTS ?? 'test-results/shots/reading-ui';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(120_000);

const MOCK_LLM = 'https://llm.mock.test/v1';

type ReadingType = 'banked_cloze' | 'matching' | 'careful_reading';
const TYPE_MARK: Record<ReadingType, string> = {
  banked_cloze: '选词填空（Banked Cloze）',
  matching: '长篇阅读（段落信息匹配）',
  careful_reading: '仔细阅读（Reading in Depth）',
};

interface MockLlm {
  /** 每次出题请求的 user 提示词（按到达顺序） */
  prompts: { type: ReadingType; text: string }[];
  /** 设了之后，出题请求先挂住，直到调用返回的函数 */
  hold: () => () => void;
  /** 接下来 n 次出题请求返回不合格的内容 */
  failNext: (n: number) => void;
}

/**
 * 模拟大模型：按提示词里的题型返回 __testutils__ 里的原创测试题（仔细阅读按请求次序轮流两篇）。
 * 题目内容只存在于测试里，App 本身不带任何示例题。
 */
async function mockLlm(
  page: Page,
  stress = false,
  carefulSet: readonly unknown[] = DEMO_CAREFUL,
): Promise<MockLlm> {
  const prompts: MockLlm['prompts'] = [];
  let gate: Promise<void> | null = null;
  let failing = 0;
  let careful = 0;
  const payload = (type: ReadingType): unknown => {
    if (stress) {
      const set = stressReadingSet(type);
      return set.parts[type === 'careful_reading' ? careful++ % 2 : 0]!.payload;
    }
    if (type === 'banked_cloze') return DEMO_BANKED_CLOZE;
    if (type === 'matching') return DEMO_MATCHING;
    return carefulSet[careful++ % 2];
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
    const type = (Object.keys(TYPE_MARK) as ReadingType[]).find((t) =>
      user[0]?.includes(TYPE_MARK[t]),
    );
    let content = 'OK';
    if (type) {
      // 校验没过时 generateQuestion 会接着问（同一对话里多一条 user 消息），只记第一次
      if (user.length === 1) prompts.push({ type, text: user[0]! });
      if (gate) await gate;
      if (failing > 0) {
        failing--;
        content = '抱歉，我现在没法出题。';
      } else content = JSON.stringify(payload(type));
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });
  return {
    prompts,
    hold: () => {
      let release = () => {};
      gate = new Promise<void>((r) => {
        release = () => {
          gate = null;
          r();
        };
      });
      return () => release();
    },
    failNext: (n) => {
      failing = n;
    },
  };
}

async function toHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/home$/);
}

/** 在设置页填好（假）大模型；网页版密钥只在内存里，之后都在 App 内跳转，不能刷新页面 */
async function fillLlmSettings(page: Page): Promise<void> {
  await page.getByTestId('llm-base-url').fill(MOCK_LLM);
  await page.getByTestId('llm-api-key').fill('sk-test-not-real');
  await page.getByTestId('llm-model').fill('mock-model');
  await page.getByTestId('llm-save').click();
  await expect(page.getByText(/已保存/).first()).toBeVisible();
}

/** 首页 → 我的 → 大模型设置 → 回首页 → 阅读 */
async function toReadingConfigured(page: Page): Promise<void> {
  await toHome(page);
  await page.getByTestId('tab-me').click();
  await page.getByTestId('open-settings').click();
  await fillLlmSettings(page);
  await page.goBack();
  await page.getByTestId('tab-home').click();
  await page.getByTestId('section-reading').click();
  await expect(page).toHaveURL(/\/reading$/);
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
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
  // 每个元素都不超出视口右边
  const over = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('[data-testid]')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => el.getBoundingClientRect().right > w + 0.5)
      .map((el) => el.getAttribute('data-testid'));
  });
  expect(over).toEqual([]);
}

test('没配大模型：阅读页和作答页都提示，点按钮去设置，填好回来自动出题', async ({ page }) => {
  const llm = await mockLlm(page);
  await toHome(page);
  await expect(page.getByTestId('section-reading')).toContainText('大模型出题');
  await page.getByTestId('section-reading').click();
  await expect(page.getByTestId('reading-unconfigured-notice')).toContainText('还没有配置大模型');
  await page.getByTestId('reading-type-banked_cloze').click();
  await expect(page.getByTestId('reading-unconfigured')).toContainText(
    '还缺：接口地址、密钥、模型名',
  );
  await page.screenshot({ path: `${SHOTS}/11-unconfigured.png` });
  expect(llm.prompts).toEqual([]);

  await page.getByTestId('reading-go-settings').click();
  await expect(page).toHaveURL(/\/settings$/);
  await fillLlmSettings(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/reading\/banked_cloze$/);
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 0/10', { timeout: 30_000 });
  expect(llm.prompts.map((x) => x.type)).toEqual(['banked_cloze']);
});

test('首页 → 阅读 → 选词填空：出题中、填词换词清空、提交判分；再来一套时避开刚才的话题', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const llm = await mockLlm(page);
  await toReadingConfigured(page);

  const release = llm.hold();
  await page.getByTestId('reading-type-banked_cloze').click();
  await expect(page).toHaveURL(/\/reading\/banked_cloze$/);
  await expect(page.getByTestId('reading-generating')).toContainText('正在出题');
  await page.screenshot({ path: `${SHOTS}/12-generating.png` });
  release();
  // 题库里第一次出题，不带「避开话题」
  await expect(page.getByTestId('reading-progress')).toBeVisible({ timeout: 30_000 });
  expect(llm.prompts).toHaveLength(1);
  expect(llm.prompts[0]!.text).not.toContain('避开以下话题');

  await expect(page.getByTestId('reading-progress')).toHaveText('已答 0/10');
  await expect(page.getByTestId('cloze-focus')).toHaveText('第 1 空');

  // 第 1 空 transform(N)、第 2 空 trapped(O)、第 3 空 pressure(I)：填完焦点自动跳到下一空
  await page.getByTestId('cloze-word-N').click();
  await expect(page.getByTestId('cloze-focus')).toHaveText('第 2 空');
  await page.getByTestId('cloze-word-O').click();
  await page.getByTestId('cloze-word-I').click();
  await expect(page.getByTestId('cloze-blank-1')).toContainText('transform');
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 3/10');

  // 用过的词变灰、不能再填
  const used = page.getByTestId('cloze-word-N');
  await expect(used).toHaveAttribute('aria-disabled', 'true');
  await expect(used).toHaveAttribute('aria-label', /已填在第 1 空/);
  await used.click({ force: true });
  await expect(page.getByTestId('cloze-focus')).toHaveText('第 4 空');
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 3/10');

  // 第 4 空先填错词 abandon(A)，点回第 4 空清空，再填 barely(B) 又换成 abandon(A)
  await page.getByTestId('cloze-word-A').click();
  await page.getByTestId('cloze-blank-4').click();
  await expect(page.getByTestId('cloze-focus')).toHaveText('第 4 空');
  await page.getByTestId('cloze-clear').click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 3/10');
  await expect(page.getByTestId('cloze-word-A')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('cloze-word-B').click();
  await page.getByTestId('cloze-blank-4').click();
  await page.getByTestId('cloze-word-A').click();
  await expect(page.getByTestId('cloze-blank-4')).toContainText('abandon');
  await expect(page.getByTestId('cloze-word-B')).not.toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: `${SHOTS}/01-cloze-answering.png` });

  // 提交：有 6 空没答，先取消一次，再确认
  let confirm = nextConfirm(page, /还有 6 题没答/, false);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-submit')).toBeVisible();
  confirm = nextConfirm(page, /还有 6 题没答/, true);
  await page.getByTestId('reading-submit').click();
  await confirm;

  await expect(page.getByTestId('reading-score')).toContainText('3');
  await expect(page.getByTestId('reading-progress')).toHaveText('答对 3/10');
  // 按六级大纲比例：选词填空每题 0.5 分
  await expect(page.getByTestId('reading-cet6')).toContainText('六级卷面折合 1.5 / 5 分');
  await expect(page.getByTestId('result-1')).toContainText('答对了');
  await expect(page.getByTestId('result-4')).toContainText('你选了 A abandon · 正确答案 B barely');
  await expect(page.getByTestId('result-5')).toContainText('没有作答');
  await expect(page.getByTestId('result-5')).toContainText('解析：');
  await page.screenshot({ path: `${SHOTS}/02-cloze-graded.png` });
  await expect(page.getByTestId('reading-saved')).toContainText('已保存到练习记录');

  // 判分后没有退出确认，直接回到题型列表
  await page.getByTestId('reading-done').click();
  await expect(page).toHaveURL(/\/reading$/);

  // 再来一套：上一套已经做过，重新出题，提示词里带上刚才那道题的话题
  await page.getByTestId('reading-type-banked_cloze').click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 0/10', { timeout: 30_000 });
  expect(llm.prompts).toHaveLength(2);
  expect(llm.prompts[1]!.text).toContain('避开以下话题');
  expect(llm.prompts[1]!.text).toContain(JSON.stringify(DEMO_BANKED_CLOZE.topic));
  expect(errors).toEqual([]);
});

test('出题失败：显示中文原因，点重试再出一次', async ({ page }) => {
  const llm = await mockLlm(page);
  await toReadingConfigured(page);
  llm.failNext(3); // 第一次加两次纠正都不是 JSON
  await page.getByTestId('reading-type-matching').click();
  await expect(page.getByTestId('reading-error-message')).toContainText(/[\u4e00-\u9fff]/, {
    timeout: 30_000,
  });
  await page.screenshot({ path: `${SHOTS}/13-generate-error.png` });
  await page.getByTestId('reading-retry-generate').click();
  await expect(page.getByTestId('para-K')).toBeVisible({ timeout: 30_000 });
});

test('长篇阅读：原文/题目切换、一段可选多次、退出确认、判分', async ({ page }) => {
  await mockLlm(page);
  await toReadingConfigured(page);
  await page.getByTestId('reading-type-matching').click();
  await expect(page.getByTestId('para-K')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('segment-题目').click();
  await page.getByTestId('match-2-B').click();
  await page.getByTestId('match-9-B').click(); // 同一段可以被多句选中
  await page.getByTestId('match-1-A').click();
  await page.getByTestId('match-1-A').click(); // 再点取消
  await page.getByTestId('match-1-F').click();
  await page.getByTestId('match-3-C').click(); // 选错
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 4/10');
  await expect(page.getByTestId('segment-题目')).toContainText('题目 4/10');
  await page.screenshot({ path: `${SHOTS}/03-matching-answering.png` });

  // 「看原文 F 段」跳到原文 F 段，切回题目还在原来的位置
  await page.getByTestId('jump-1').click();
  await expect(page.getByTestId('para-F')).toBeInViewport();
  await page.getByTestId('segment-题目').click();
  await expect(page.getByTestId('match-1-F')).toBeVisible();

  // 中途退出：取消就留在原页
  let confirm = nextConfirm(page, /退出这次练习/, false);
  await page.getByTestId('reading-close').click();
  await confirm;
  await expect(page).toHaveURL(/\/reading\/matching$/);

  confirm = nextConfirm(page, /还有 6 题没答/, true);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-progress')).toHaveText('答对 3/10');
  await expect(page.getByTestId('result-3')).toContainText('正确答案 D');
  await expect(page.getByTestId('reading-cet6')).toContainText('六级卷面折合 3 / 10 分');
  await page.screenshot({ path: `${SHOTS}/04-matching-graded.png` });

  // 再做一遍：清空重来；答一题后退出要确认，确认后回到列表
  await page.getByTestId('reading-retry').click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 0/10');
  await page.getByTestId('match-1-A').click();
  confirm = nextConfirm(page, /退出这次练习/, true);
  await page.getByTestId('reading-close').click();
  await confirm;
  await expect(page).toHaveURL(/\/reading$/);
});

test('仔细阅读：两篇切换作答、全部答完提交、判分', async ({ page }) => {
  await mockLlm(page);
  await toReadingConfigured(page);
  await page.getByTestId('reading-type-careful_reading').click();
  await expect(page.getByTestId('careful-1-A')).toBeVisible({ timeout: 30_000 });
  // 两篇是并行生成的，按第一篇的内容决定哪套答案在前
  const key = DEMO_CAREFUL.map((p) => p.questions.map((q) => q.answer));
  const boredomFirst = await page
    .getByText(/Most of us treat boredom/)
    .first()
    .isVisible();
  const [first, second] = boredomFirst ? [key[0]!, key[1]!] : [key[1]!, key[0]!];
  for (const [i, k] of first.entries()) await page.getByTestId(`careful-${i + 1}-${k}`).click();
  await page.screenshot({ path: `${SHOTS}/05-careful-answering.png` });
  await page.getByTestId('segment-1').click();
  const wrong = second[4] === 'A' ? 'B' : 'A'; // 最后一题选错
  for (const [i, k] of [...second.slice(0, 4), wrong].entries())
    await page.getByTestId(`careful-${i + 6}-${k}`).click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 10/10');

  const confirm = nextConfirm(page, /提交答案/, true);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-progress')).toHaveText('答对 9/10');
  await expect(page.getByTestId('reading-cet6').first()).toContainText('六级卷面折合 18 / 20 分');
  await expect(page.getByTestId('result-10')).toContainText(
    `你选了 ${wrong} · 正确答案 ${second[4]}`,
  );
  await page.getByTestId('result-10').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/06-careful-graded.png` });
});

test('仔细阅读：题干里的 Markdown 显示成纯文本', async ({ page }) => {
  const md = (stem: string) => `**${stem.replace(/\?$/, '')}** _today_?`;
  const set = DEMO_CAREFUL.map((p) => ({
    ...p,
    questions: p.questions.map((q, i) => (i === 0 ? { ...q, stem: md(q.stem) } : q)),
  }));
  await mockLlm(page, false, set);
  await toReadingConfigured(page);
  await page.getByTestId('reading-type-careful_reading').click();
  await expect(page.getByTestId('careful-1-A')).toBeVisible({ timeout: 30_000 });
  const stem = page.getByTestId('careful-stem-1');
  const text = (await stem.textContent())!;
  expect(text).toMatch(/^1\. .+ today\?$/);
  expect(text).not.toMatch(/[*_]/);
  const plain = DEMO_CAREFUL.map((p) => `1. ${p.questions[0]!.stem.replace(/\?$/, '')} today?`);
  expect(plain).toContain(text);
  await expect(page.getByTestId('careful-stem-2')).not.toContainText('*');
});

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });
  test('选词填空作答中', async ({ page }) => {
    await mockLlm(page);
    await toReadingConfigured(page);
    await page.getByTestId('reading-type-banked_cloze').click();
    await page.getByTestId('cloze-word-N').click({ timeout: 30_000 });
    await page.getByTestId('cloze-word-O').click();
    await page.getByTestId('cloze-word-L').click();
    await page.screenshot({ path: `${SHOTS}/07-cloze-dark.png` });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});

test.describe('压测：360 宽、超长单词和段落', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('三种题型都不横向溢出', async ({ page }) => {
    await mockLlm(page, true);
    await toHome(page);
    await noHorizontalOverflow(page);
    await page.getByTestId('section-reading').click();
    await page.getByTestId('reading-type-banked_cloze').click();
    await expect(page.getByTestId('reading-unconfigured')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByTestId('reading-go-settings').click();
    await fillLlmSettings(page);
    await page.goBack();
    await page.getByTestId('cloze-word-A').click({ timeout: 30_000 });
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/08-stress-cloze-360.png` });
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reading-submit').click();
    await expect(page.getByTestId('reading-score')).toBeVisible();
    await noHorizontalOverflow(page);
    await page.getByTestId('reading-done').click();
    await expect(page.getByTestId('reading-type-careful_reading')).toBeVisible();
    await noHorizontalOverflow(page);

    await page.getByTestId('reading-type-matching').click();
    await expect(page.getByTestId('para-A')).toBeVisible({ timeout: 30_000 });
    await noHorizontalOverflow(page);
    await page.getByTestId('segment-题目').click();
    await page.getByTestId('match-1-K').click();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/09-stress-matching-360.png` });
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reading-close').click();
    await expect(page).toHaveURL(/\/reading$/);

    await page.getByTestId('reading-type-careful_reading').click();
    await page.getByTestId('careful-1-D').click({ timeout: 30_000 });
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/10-stress-careful-360.png` });
  });

  test('不认识的题型显示找不到', async ({ page }) => {
    await toHome(page);
    await page.goto('/reading/careful');
    await expect(page.getByTestId('reading-not-found')).toBeVisible({ timeout: 60_000 });
  });
});
