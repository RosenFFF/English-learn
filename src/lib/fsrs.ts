/**
 * ts-fsrs 封装（纯逻辑）。负责数据库行 <-> FSRS Card 的互转，以及四档评分。
 * 评分映射：忘了=Again，模糊=Hard，认识=Good，简单=Easy。
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
} from 'ts-fsrs';

export type UiRating = 'again' | 'hard' | 'good' | 'easy';
export const UI_RATINGS: readonly UiRating[] = ['again', 'hard', 'good', 'easy'];

export const RATING_LABEL: Record<UiRating, string> = {
  again: '忘了',
  hard: '模糊',
  good: '认识',
  easy: '简单',
};

export const RATING_TO_FSRS: Record<UiRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** 与 FSRS State 数值一致：0 新词 1 学习中 2 复习 3 重学 */
export const CardState = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
} as const;

/** user.db card 表的一行 */
export interface CardRow {
  word_id: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
  updated_at: number;
  deleted: number;
}

/** user.db review_log 表的一行（state、due 是评分前的值，与 ts-fsrs ReviewLog 一致） */
export interface ReviewLogRow {
  id: string;
  word_id: number;
  rating: number;
  state: number;
  due: number;
  reviewed_at: number;
  elapsed_days: number;
  scheduled_days: number;
}

export interface SchedulerOptions {
  requestRetention?: number;
  maximumIntervalDays?: number;
  enableFuzz?: boolean;
}

export function createScheduler(opts: SchedulerOptions = {}): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: opts.requestRetention ?? 0.9,
      maximum_interval: opts.maximumIntervalDays ?? 3650,
      enable_fuzz: opts.enableFuzz ?? true,
      enable_short_term: true,
      // 新词：「认识/简单」直接毕业进入复习；「忘了/模糊」在本组内再出现一次
      learning_steps: ['1m'],
      relearning_steps: ['10m'],
    }),
  );
}

const defaultScheduler = createScheduler();

export function newCardRow(wordId: number, now: number): CardRow {
  return cardToRow(wordId, createEmptyCard(new Date(now)), now);
}

export function rowToCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review == null ? undefined : new Date(row.last_review),
  };
}

export function cardToRow(wordId: number, card: Card, now: number): CardRow {
  return {
    word_id: wordId,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
    updated_at: now,
    deleted: 0,
  };
}

export interface RateResult {
  card: CardRow;
  log: ReviewLogRow;
}

export function rateCard(
  row: CardRow,
  rating: UiRating,
  now: number,
  logId: string,
  scheduler: FSRS = defaultScheduler,
): RateResult {
  const item = scheduler.next(rowToCard(row), new Date(now), RATING_TO_FSRS[rating]);
  return {
    card: cardToRow(row.word_id, item.card, now),
    log: {
      id: logId,
      word_id: row.word_id,
      rating: item.log.rating,
      state: item.log.state,
      due: item.log.due.getTime(),
      reviewed_at: now,
      elapsed_days: item.log.elapsed_days,
      scheduled_days: item.log.scheduled_days,
    },
  };
}

/** 四个按钮下方显示的「下次复习间隔」（毫秒） */
export function previewIntervals(
  row: CardRow,
  now: number,
  scheduler: FSRS = defaultScheduler,
): Record<UiRating, number> {
  const preview = scheduler.repeat(rowToCard(row), new Date(now));
  const out = {} as Record<UiRating, number>;
  for (const r of UI_RATINGS) out[r] = preview[RATING_TO_FSRS[r]].card.due.getTime() - now;
  return out;
}

/** 当前回忆概率（0–1），新词返回 0 */
export function retrievability(
  row: Pick<CardRow, 'state' | 'stability' | 'last_review'>,
  now: number,
  scheduler: FSRS = defaultScheduler,
): number {
  if (row.state === CardState.New || row.last_review == null || row.stability <= 0) return 0;
  const elapsedDays = Math.max(0, (now - row.last_review) / 86_400_000);
  return scheduler.forgetting_curve(elapsedDays, row.stability);
}
