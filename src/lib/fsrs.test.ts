import {
  CardState,
  cardToRow,
  createScheduler,
  newCardRow,
  previewIntervals,
  rateCard,
  retrievability,
  rowToCard,
  type CardRow,
} from './fsrs';

const now = new Date(2026, 9, 17, 9, 0).getTime();
const MIN = 60_000;
const DAY = 86_400_000;
const sched = createScheduler({ enableFuzz: false });

function reviewCard(): CardRow {
  // 新词 → 认识 → 认识，进入复习状态
  let c = newCardRow(1, now);
  let t = now;
  for (let i = 0; i < 4 && c.state !== CardState.Review; i++) {
    c = rateCard(c, 'good', t, `l${i}`, sched).card;
    t = c.due;
  }
  return c;
}

describe('评分 → FSRS', () => {
  it('新词选「忘了」进入学习中，几分钟后再出现', () => {
    const { card, log } = rateCard(newCardRow(1, now), 'again', now, 'id1', sched);
    expect(card.state).toBe(CardState.Learning);
    expect(card.due - now).toBeLessThanOrEqual(10 * MIN);
    expect(card.reps).toBe(1);
    expect(log).toMatchObject({
      id: 'id1',
      word_id: 1,
      rating: 1,
      state: CardState.New,
      reviewed_at: now,
    });
  });

  it('新词选「简单」直接进入复习，间隔至少 1 天', () => {
    const { card } = rateCard(newCardRow(1, now), 'easy', now, 'x', sched);
    expect(card.state).toBe(CardState.Review);
    expect(card.due - now).toBeGreaterThanOrEqual(DAY);
  });

  it('四档评分的间隔单调递增：忘了 < 模糊 < 认识 < 简单', () => {
    const c = reviewCard();
    const at = c.due;
    const iv = previewIntervals(c, at, sched);
    expect(iv.again).toBeLessThan(iv.hard);
    expect(iv.hard).toBeLessThan(iv.good);
    expect(iv.good).toBeLessThan(iv.easy);
  });

  it('复习时「忘了」：lapses+1，进入重学', () => {
    const c = reviewCard();
    const { card, log } = rateCard(c, 'again', c.due, 'y', sched);
    expect(card.lapses).toBe(c.lapses + 1);
    expect(card.state).toBe(CardState.Relearning);
    expect(log.state).toBe(CardState.Review); // 日志记评分前的状态
  });

  it('数据库行与 FSRS Card 互转不丢字段', () => {
    const c = reviewCard();
    const back = cardToRow(c.word_id, rowToCard(c), c.updated_at);
    expect(back).toEqual(c);
    const fresh = newCardRow(7, now);
    expect(fresh).toMatchObject({
      word_id: 7,
      state: CardState.New,
      reps: 0,
      last_review: null,
      deleted: 0,
    });
  });

  it('回忆概率：新词为 0；刚复习过接近 1，随时间下降', () => {
    expect(retrievability(newCardRow(1, now), now)).toBe(0);
    const c = reviewCard();
    const r0 = retrievability(c, c.last_review ?? now, sched);
    const r1 = retrievability(c, (c.last_review ?? now) + 30 * DAY, sched);
    expect(r0).toBeGreaterThan(0.99);
    expect(r1).toBeLessThan(r0);
  });
});
