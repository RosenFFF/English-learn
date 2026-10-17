import { getDatabases } from '../../db/open';
import { getRecentNewCards, getWeakCards } from '../../db/userRepo';
import { getWords } from '../../db/wordsRepo';
import { DAY_MS } from '../../lib/date';
import type { WordDetail } from '../../lib/words';
import { useLoader } from '../shared';

export interface PracticeWord {
  word: WordDetail;
  /** 累计选「忘了」的次数（生词列表里为 0） */
  forgotten: number;
  reps: number;
  /** 下次复习时间（毫秒） */
  due: number;
}

export interface PracticeLists {
  weak: PracticeWord[];
  recent: PracticeWord[];
}

export async function loadPracticeLists(now: number = Date.now()): Promise<PracticeLists> {
  const { words, user } = await getDatabases();
  const [weak, recent] = await Promise.all([
    getWeakCards(user, now - 14 * DAY_MS, 100),
    getRecentNewCards(user, now - 7 * DAY_MS, 100),
  ]);
  const details = await getWords(
    words,
    [...weak, ...recent].map((c) => c.word_id),
  );
  const map = (
    rows: { word_id: number; again_count?: number; reps: number; due: number }[],
  ): PracticeWord[] =>
    rows.flatMap((c) => {
      const word = details.get(c.word_id);
      return word ? [{ word, forgotten: c.again_count ?? 0, reps: c.reps, due: c.due }] : [];
    });
  return { weak: map(weak), recent: map(recent) };
}

const load = (): Promise<PracticeLists> => loadPracticeLists();
export function usePracticeLists() {
  return useLoader(load);
}
