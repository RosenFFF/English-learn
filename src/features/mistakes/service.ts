/**
 * 错题本：客观题按最近一次作答的 wrong_count 列出做错的题，主观题列出待重练（needs_redo）的题，
 * 按板块分组；点进去用原来的作答页重做那道原题（不重新出题）。
 * 规则见 src/lib/exam/mistakes.ts；页面只经过这里。
 */
import type { Href } from 'expo-router';

import { getDatabases } from '../../db/open';
import { listOpenMistakes } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import {
  countMistakes,
  groupMistakes,
  type MistakeGroup,
  type MistakeItem,
} from '../../lib/exam/mistakes';
import { getExam, type ExamId } from '../../lib/exams';
import { readSelectedExam } from '../exam/service';
import { useLoader } from '../shared';

export type { MistakeGroup, MistakeItem, RedoTarget } from '../../lib/exam/mistakes';
/** 主观题重做到这个分数就移出错题本 */
export { REDO_THRESHOLD } from '../../lib/exam/types';

export interface MistakeBook {
  exam: ExamId;
  groups: MistakeGroup[];
  total: number;
}

export async function loadMistakeBook(user: SqlDb, exam: ExamId): Promise<MistakeBook> {
  const rows = await listOpenMistakes(user, exam);
  const groups = groupMistakes(rows, getExam(exam).sections);
  return { exam, groups, total: countMistakes(groups) };
}

/** 页面用：当前考试的错题本 */
export async function getMistakeBook(): Promise<MistakeBook> {
  const { user } = await getDatabases();
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  return loadMistakeBook(user, exam);
}

/** 错题本（页面聚焦、作答写入后自动刷新：重做通过的题回来就不见了） */
export function useMistakeBook() {
  return useLoader(getMistakeBook);
}

/** 点一条错题去哪重做；不能重做（读不出来、听力还没上线）返回 null */
export function redoHref(item: MistakeItem): Href | null {
  const t = item.redo;
  if (!t) return null;
  if (t.screen === 'reading')
    return { pathname: '/reading/[type]', params: { type: t.type, redo: item.questionId } };
  return {
    pathname: t.screen === 'translation' ? '/translation' : '/writing',
    params: { redo: item.questionId },
  };
}
