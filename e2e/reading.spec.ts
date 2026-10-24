import { expect, test, type Page } from '@playwright/test';

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

async function toHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('exam-cet6').click({ timeout: 60_000 });
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

test('首页 → 阅读 → 选词填空：填词、换词、清空，提交后看到判分', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await toHome(page);

  await expect(page.getByTestId('section-reading')).toContainText('示例题');
  await page.getByTestId('section-reading').click();
  await expect(page).toHaveURL(/\/reading$/);
  await page.getByTestId('reading-type-banked_cloze').click();
  await expect(page).toHaveURL(/\/reading\/banked_cloze$/);
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

  // 判分后没有退出确认，直接回到题型列表
  await page.getByTestId('reading-done').click();
  await expect(page).toHaveURL(/\/reading$/);
  expect(errors).toEqual([]);
});

test('长篇阅读：原文/题目切换、一段可选多次、退出确认、判分', async ({ page }) => {
  await toHome(page);
  await page.getByTestId('section-reading').click();
  await page.getByTestId('reading-type-matching').click();
  await expect(page.getByTestId('para-K')).toBeVisible();

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
  await toHome(page);
  await page.getByTestId('section-reading').click();
  await page.getByTestId('reading-type-careful_reading').click();
  const first = ['B', 'C', 'A', 'B', 'C'];
  for (const [i, k] of first.entries()) await page.getByTestId(`careful-${i + 1}-${k}`).click();
  await page.screenshot({ path: `${SHOTS}/05-careful-answering.png` });
  await page.getByTestId('segment-1').click();
  const second = ['B', 'A', 'C', 'D', 'B']; // 最后一题选错
  for (const [i, k] of second.entries()) await page.getByTestId(`careful-${i + 6}-${k}`).click();
  await expect(page.getByTestId('reading-progress')).toHaveText('已答 10/10');

  const confirm = nextConfirm(page, /提交答案/, true);
  await page.getByTestId('reading-submit').click();
  await confirm;
  await expect(page.getByTestId('reading-progress')).toHaveText('答对 9/10');
  await expect(page.getByTestId('reading-cet6').first()).toContainText('六级卷面折合 18 / 20 分');
  await expect(page.getByTestId('result-10')).toContainText('你选了 B · 正确答案 A');
  await page.getByTestId('result-10').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/06-careful-graded.png` });
});

test.describe('深色模式', () => {
  test.use({ colorScheme: 'dark' });
  test('选词填空作答中', async ({ page }) => {
    await toHome(page);
    await page.goto('/reading/banked_cloze');
    await page.getByTestId('cloze-word-N').click({ timeout: 60_000 });
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
    await toHome(page);
    await noHorizontalOverflow(page);
    await page.goto('/reading');
    await expect(page.getByTestId('reading-type-careful_reading')).toBeVisible({ timeout: 60_000 });
    await noHorizontalOverflow(page);

    await page.goto('/reading/banked_cloze?demo=stress');
    await page.getByTestId('cloze-word-A').click({ timeout: 60_000 });
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/08-stress-cloze-360.png` });
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('reading-submit').click();
    await expect(page.getByTestId('reading-score')).toBeVisible();
    await noHorizontalOverflow(page);

    await page.goto('/reading/matching?demo=stress');
    await expect(page.getByTestId('para-A')).toBeVisible({ timeout: 60_000 });
    await noHorizontalOverflow(page);
    await page.getByTestId('segment-题目').click();
    await page.getByTestId('match-1-K').click();
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/09-stress-matching-360.png` });

    await page.goto('/reading/careful_reading?demo=stress');
    await page.getByTestId('careful-1-D').click({ timeout: 60_000 });
    await noHorizontalOverflow(page);
    await page.screenshot({ path: `${SHOTS}/10-stress-careful-360.png` });
  });

  test('不认识的题型显示找不到', async ({ page }) => {
    await toHome(page);
    await page.goto('/reading/careful');
    await expect(page.getByTestId('reading-not-found')).toBeVisible({ timeout: 60_000 });
  });
});
