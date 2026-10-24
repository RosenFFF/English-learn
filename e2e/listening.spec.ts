import { expect, test, type Page } from '@playwright/test';

import {
  DEMO_LONG_CONVERSATION,
  DEMO_PASSAGE,
  STRESS_LECTURE,
  DEMO_LECTURE,
} from '../src/lib/exam/__testutils__/listening-fixtures';

// 截图默认放 test-results 下（已被 .gitignore 忽略）；设 LISTENING_SHOTS 可另存到别处
const SHOTS = process.env.LISTENING_SHOTS ?? 'test-results/shots/listening';
const MOCK_LLM = 'https://llm.mock.test/v1';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
});
test.setTimeout(120_000);

type ListeningType = 'long_conversation' | 'passage' | 'lecture';
const TYPE_MARK: Record<ListeningType, string> = {
  long_conversation: '题型：听力·长对话',
  passage: '题型：听力·短文',
  lecture: '题型：听力·讲座',
};

/** 模拟大模型：按提示词里的题型返回 __testutils__ 里的原创听力稿子 */
async function mockLlm(page: Page, stress = false): Promise<ListeningType[]> {
  const prompts: ListeningType[] = [];
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
    const type = (Object.keys(TYPE_MARK) as ListeningType[]).find((t) =>
      user[0]?.includes(TYPE_MARK[t]),
    );
    let content = 'OK';
    if (type) {
      if (user.length === 1) prompts.push(type);
      content = JSON.stringify(
        type === 'long_conversation'
          ? DEMO_LONG_CONVERSATION
          : type === 'passage'
            ? DEMO_PASSAGE
            : stress
              ? STRESS_LECTURE
              : DEMO_LECTURE,
      );
    }
    return route.fulfill({
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content } }] }),
    });
  });
  return prompts;
}

interface Spoken {
  text: string;
  voice: string | null;
  rate: number;
  pitch: number;
}

/**
 * 模拟浏览器的 speechSynthesis（headless Chromium 没有可用的语音）：
 * 记下每一句的文字、音色、语速；默认挂住不念完，测试里调 finish() 让当前这句念完。
 */
async function mockSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type U = {
      text: string;
      voice: { voiceURI: string } | null;
      rate: number;
      pitch: number;
      lang: string;
      onstart?: (e: unknown) => void;
      onend?: (e: unknown) => void;
      onerror?: (e: unknown) => void;
    };
    const voices = [
      {
        voiceURI: 'mock-samantha',
        name: 'Samantha',
        lang: 'en-US',
        default: true,
        localService: true,
      },
      {
        voiceURI: 'mock-daniel',
        name: 'Daniel',
        lang: 'en-GB',
        default: false,
        localService: true,
      },
      {
        voiceURI: 'mock-tingting',
        name: 'Tingting',
        lang: 'zh-CN',
        default: false,
        localService: true,
      },
    ];
    const state = { spoken: [] as unknown[], cancels: 0, current: null as U | null };
    class FakeUtterance {
      text: string;
      voice = null;
      rate = 1;
      pitch = 1;
      lang = '';
      constructor(text?: string) {
        this.text = text ?? '';
      }
    }
    const synth = {
      speaking: false,
      paused: false,
      pending: false,
      onvoiceschanged: null,
      getVoices: () => voices,
      speak(u: U) {
        state.spoken.push({
          text: u.text,
          voice: u.voice?.voiceURI ?? null,
          rate: u.rate,
          pitch: u.pitch,
        });
        state.current = u;
        synth.speaking = true;
        setTimeout(() => u.onstart?.({}), 0);
      },
      cancel() {
        state.cancels++;
        const u = state.current;
        state.current = null;
        synth.speaking = false;
        // 和 Chrome 一样：取消时当前这句会收到 error（interrupted）
        if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0);
      },
      pause() {},
      resume() {},
    };
    const w = window as unknown as Record<string, unknown>;
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    w.SpeechSynthesisUtterance = FakeUtterance;
    w.__tts = {
      state,
      finish() {
        const u = state.current;
        state.current = null;
        synth.speaking = false;
        u?.onend?.({});
      },
    };
  });
}

const spoken = (page: Page): Promise<Spoken[]> =>
  page.evaluate(
    () => (window as unknown as { __tts: { state: { spoken: Spoken[] } } }).__tts.state.spoken,
  );
const cancels = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { __tts: { state: { cancels: number } } }).__tts.state.cancels,
  );
const lastSpoken = async (page: Page): Promise<Spoken | undefined> => (await spoken(page)).at(-1);
async function finish(page: Page, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    const n = (await spoken(page)).length;
    await page.evaluate(() =>
      (window as unknown as { __tts: { finish: () => void } }).__tts.finish(),
    );
    // 等下一句开始（最后一句念完就不会再有）
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(n);
  }
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

function nextConfirm(page: Page, title: RegExp): Promise<void> {
  return new Promise((resolve, reject) => {
    page.once('dialog', (d) => {
      try {
        expect(d.message()).toMatch(title);
        resolve(d.accept());
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

const CONV = DEMO_LONG_CONVERSATION;

test('选题型 → 分角色朗读、念题高亮、播放控件 → 作答交卷 → 结果页展开原文逐句重听', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await mockSpeech(page);
  const prompts = await mockLlm(page);
  await toHomeConfigured(page);

  // 首页听力卡片已上线，进入选题型
  const card = page.getByTestId('section-listening');
  await expect(card).toContainText('3 种题型');
  await card.click();
  await expect(page).toHaveURL(/\/listening$/);
  for (const t of ['long_conversation', 'passage', 'lecture'])
    await expect(page.getByTestId(`listening-type-${t}`)).toBeVisible();
  await expect(page.getByTestId('listening-type-long_conversation')).toContainText('4 题');
  await page.screenshot({ path: `${SHOTS}/01-choose-type.png` });

  await page.getByTestId('listening-type-long_conversation').click();
  await expect(page).toHaveURL(/\/listening\/long_conversation$/);
  await expect(page.getByTestId('listening-play')).toBeVisible({ timeout: 30_000 });
  expect(prompts).toEqual(['long_conversation']);
  await expect(page.getByTestId('listening-progress')).toHaveText('已答 0/4');
  // 作答时不显示原文；念题打开时题干要念到才出现
  await expect(page.getByText(CONV.script[0]!.text)).toHaveCount(0);
  await expect(page.getByTestId('listening-stem-1')).toHaveText('题干会在原文念完后念出');
  const toggle = page.getByTestId('listening-read-questions');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('listening-player-status')).toContainText('共 10 段原文');
  // 触控区域 ≥ 44
  for (const id of ['listening-play', 'listening-replay', 'listening-restart', 'listening-1-A']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // 播放：女声念 W，男声念 M（按 gender 选 en-US / en-GB 音色）
  await page.getByTestId('listening-play').click();
  await expect.poll(async () => (await spoken(page)).length).toBe(1);
  expect(await lastSpoken(page)).toMatchObject({
    text: CONV.script[0]!.text,
    voice: 'mock-samantha',
    rate: 1,
  });
  await expect(page.getByTestId('listening-player-status')).toHaveText('第 1/10 段 · Woman');
  await finish(page);
  await expect.poll(async () => (await lastSpoken(page))?.voice).toBe('mock-daniel');
  await expect(page.getByTestId('listening-player-status')).toHaveText('第 2/10 段 · Man');

  // 暂停：停掉这一句；迟到的回调不会往下念；继续从这一句开头重念
  await page.getByTestId('listening-play').click();
  await expect(page.getByTestId('listening-player-status')).toHaveText('已暂停 · 第 2/10 段 · Man');
  expect(await cancels(page)).toBeGreaterThan(0);
  const before = (await spoken(page)).length;
  await page.waitForTimeout(100);
  expect((await spoken(page)).length).toBe(before);
  await page.getByTestId('listening-play').click();
  await expect.poll(async () => (await spoken(page)).length).toBe(before + 1);
  expect((await lastSpoken(page))!.text).toBe(CONV.script[1]!.text);

  // 重听本条
  await page.getByTestId('listening-replay').click();
  await expect.poll(async () => (await spoken(page)).length).toBe(before + 2);
  expect((await lastSpoken(page))!.text).toBe(CONV.script[1]!.text);

  // 语速 0.8：从这一句开头按新语速重念
  await page.getByTestId('segment-0.8').click();
  await expect.poll(async () => (await lastSpoken(page))?.rate).toBe(0.8);
  expect((await lastSpoken(page))!.text).toBe(CONV.script[1]!.text);

  // 念完原文 → 旁白（女声）念第 1 题题干，题目卡片高亮，题干出现；选项不念
  await finish(page, CONV.script.length - 1);
  await expect
    .poll(async () => (await lastSpoken(page))?.text)
    .toBe(`Question 1. ${CONV.questions[0]!.stem}`);
  expect((await lastSpoken(page))!.voice).toBe('mock-samantha');
  await expect(page.getByTestId('listening-q-1')).toContainText('第 1 题 · 正在念');
  await expect(page.getByTestId('listening-stem-1')).toHaveText(CONV.questions[0]!.stem);
  await expect(page.getByTestId('listening-stem-2')).toHaveText('题干会在原文念完后念出');
  await expect(page.getByTestId('listening-player-status')).toHaveText('念题 · 第 1 题');
  await page.screenshot({ path: `${SHOTS}/02a-player-reading-question.png` });
  await finish(page);
  await expect(page.getByTestId('listening-q-2')).toContainText('第 2 题 · 正在念');
  await expect(page.getByTestId('listening-q-1')).not.toContainText('正在念');
  await page.getByTestId('listening-q-2').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/02-playing-highlight.png` });
  const all = await spoken(page);
  for (const q of CONV.questions)
    for (const o of q.options) expect(all.some((s) => s.text.includes(o))).toBe(false);

  // 关掉念题：正在念题时停下、标为念完；题干全部显示
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('listening-player-status')).toHaveText(/^已念完/);
  await expect(page.getByTestId('listening-stem-4')).toHaveText(CONV.questions[3]!.stem);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // 从头开始
  await page.getByTestId('listening-restart').click();
  await expect.poll(async () => (await lastSpoken(page))?.text).toBe(CONV.script[0]!.text);

  // 作答：3 对 1 错，交卷时停止朗读
  const answers = CONV.questions.map((q) => q.answer);
  for (const [i, a] of answers.slice(0, 3).entries())
    await page.getByTestId(`listening-${i + 1}-${a}`).click();
  await page.getByTestId(`listening-4-${answers[3] === 'B' ? 'C' : 'B'}`).click();
  await expect(page.getByTestId('listening-progress')).toHaveText('已答 4/4');
  const c0 = await cancels(page);
  const confirm = nextConfirm(page, /提交答案/);
  await page.getByTestId('listening-submit').click();
  await confirm;
  await expect(page.getByTestId('listening-progress')).toHaveText('答对 3/4');
  expect(await cancels(page)).toBeGreaterThan(c0);
  await expect(page.getByTestId('listening-saved')).toHaveText('已保存到练习记录');
  await expect(page.getByTestId('listening-score')).toContainText('3');
  await expect(page.getByTestId('listening-cet6')).toContainText('六级卷面折合 3 / 4 分');
  await expect(page.getByTestId('listening-result-1')).toContainText('答对了');
  await expect(page.getByTestId('listening-result-4')).toContainText(`正确答案 ${answers[3]}`);
  await expect(page.getByTestId('listening-result-4')).toContainText(
    CONV.questions[3]!.explanation,
  );

  // 结果页：展开分角色原文，点一句单独重听
  await expect(page.getByTestId('listening-transcript')).toHaveCount(0);
  await page.getByTestId('listening-transcript-toggle').click();
  const transcript = page.getByTestId('listening-transcript');
  await expect(transcript).toContainText(CONV.script[0]!.text);
  await expect(transcript).toContainText('Woman');
  await expect(transcript).toContainText('Man');
  await page.getByTestId('listening-line-1').click();
  await expect.poll(async () => (await lastSpoken(page))?.text).toBe(CONV.script[1]!.text);
  expect((await lastSpoken(page))!.voice).toBe('mock-daniel');
  await page.getByTestId('listening-line-1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/03-result-transcript.png` });
  await finish(page);
  // 逐句重听只念这一句
  await page.waitForTimeout(100);
  expect((await lastSpoken(page))!.text).toBe(CONV.script[1]!.text);

  // 正在念时离开页面：停止朗读
  await page.getByTestId('listening-line-2').click();
  await expect.poll(async () => (await lastSpoken(page))?.text).toBe(CONV.script[2]!.text);
  const c1 = await cancels(page);
  await page.getByTestId('listening-done').click();
  await expect(page).toHaveURL(/\/listening$/);
  await expect.poll(() => cancels(page)).toBeGreaterThan(c1);
  expect(errors).toEqual([]);
});

test('没配大模型：选题型页和作答页都提示，并能跳到设置', async ({ page }) => {
  await mockSpeech(page);
  await toHome(page);
  await page.getByTestId('section-listening').click();
  await expect(page).toHaveURL(/\/listening$/);
  await expect(page.getByTestId('listening-unconfigured-notice')).toContainText('还缺');
  await page.getByTestId('listening-type-passage').click();
  await expect(page.getByTestId('listening-unconfigured')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('listening-unconfigured')).toContainText('还没有配置大模型');
  await page.screenshot({ path: `${SHOTS}/04-unconfigured.png` });
  await page.getByTestId('listening-go-settings').click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('听力做错进错题本 → 点进去重做原题（不调大模型）→ 全对后移出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await mockSpeech(page);
  const prompts = await mockLlm(page);
  await toHomeConfigured(page);
  await page.getByTestId('section-listening').click();
  await page.getByTestId('listening-type-passage').click();
  await expect(page.getByTestId('listening-play')).toBeVisible({ timeout: 30_000 });
  let confirm = nextConfirm(page, /还有 3 题没答/);
  await page.getByTestId('listening-submit').click();
  await confirm;
  await expect(page.getByTestId('listening-saved')).toHaveText('已保存到练习记录');
  await page.getByTestId('listening-done').click();
  await expect(page).toHaveURL(/\/listening$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);

  await page.getByTestId('section-mistakes').click();
  const group = page.getByTestId('mistake-group-listening');
  await expect(group).toContainText('听力·短文');
  await expect(group).toContainText('错 3 题');
  await expect(group).toContainText(DEMO_PASSAGE.topic);
  await expect(group).not.toContainText('上线后');
  const id = (await group
    .locator('[data-testid^="mistake-"][role="button"]')
    .first()
    .getAttribute('data-testid'))!.replace(/^mistake-/, '');
  await page.getByTestId(`mistake-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`/listening/passage\\?redo=${id}$`));
  await expect(page.getByTestId('listening-progress')).toHaveText('已答 0/3', { timeout: 30_000 });
  await expect(page.getByText('重做 · 听力篇章')).toBeVisible();
  for (const [i, q] of DEMO_PASSAGE.questions.entries())
    await page.getByTestId(`listening-${i + 1}-${q.answer}`).click();
  confirm = nextConfirm(page, /提交答案/);
  await page.getByTestId('listening-submit').click();
  await confirm;
  await expect(page.getByTestId('listening-saved')).toHaveText('已保存 · 重做通过，已从错题本移出');
  await page.getByTestId('listening-done').click();
  await expect(page).toHaveURL(/\/mistakes$/);
  await expect(page.getByTestId('mistakes-empty')).toBeVisible();
  expect(prompts).toEqual(['passage']);
  expect(errors).toEqual([]);
});

test('打不开的听力重做链接：中文原因和返回按钮', async ({ page }) => {
  await mockSpeech(page);
  await toHome(page);
  await page.goto('/listening/lecture?redo=missing');
  await expect(page.getByTestId('listening-error-message')).toHaveText(
    '找不到这道题，可能已经被清除了',
    { timeout: 60_000 },
  );
  await expect(page.getByTestId('listening-retry-generate')).toHaveCount(0);
  await page.goto('/listening/speaking');
  await expect(page.getByTestId('listening-not-found')).toBeVisible({ timeout: 60_000 });
});

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });
  test('作答页', async ({ page }) => {
    await mockSpeech(page);
    await mockLlm(page);
    await toHomeConfigured(page);
    await page.getByTestId('section-listening').click();
    await page.getByTestId('listening-type-lecture').click();
    await expect(page.getByTestId('listening-play')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('listening-play').click();
    await expect.poll(async () => (await spoken(page)).length).toBe(1);
    await page.getByTestId('listening-1-B').click();
    await page.screenshot({ path: `${SHOTS}/05-dark.png` });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});

test.describe('压测：360 宽、超长称呼和单词', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('作答页和结果页（展开原文）都不横向溢出', async ({ page }) => {
    await mockSpeech(page);
    await mockLlm(page, true);
    await toHomeConfigured(page);
    await page.getByTestId('section-listening').click();
    await noHorizontalOverflow(page);
    await page.getByTestId('listening-type-lecture').click();
    await expect(page.getByTestId('listening-play')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('listening-play').click();
    await expect(page.getByTestId('listening-player-status')).toContainText('Professor');
    await noHorizontalOverflow(page);
    const confirm = nextConfirm(page, /没答/);
    await page.getByTestId('listening-submit').click();
    await confirm;
    await page.getByTestId('listening-transcript-toggle').click();
    await expect(page.getByTestId('listening-transcript')).toContainText('Supercalifragilistic');
    await noHorizontalOverflow(page);
    await page.getByTestId('listening-line-0').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/06-stress-360.png` });
  });
});
