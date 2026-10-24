/** 当前在准备的考试：读写 kv `exam`，选考试时按需激活默认词书。 */
import { getDatabases } from '../../db/open';
import { activatePlan, getActivePlan, kvGet, kvSet } from '../../db/userRepo';
import type { SqlDb } from '../../db/types';
import { getExam, isSelectableExam, type ExamId } from '../../lib/exams';
import { DEFAULT_DAILY_NEW, DEFAULT_DAILY_REVIEW_CAP } from '../books/constants';
import { notifyDataChanged, useLoader } from '../shared';

export {
  EXAMS,
  STATUS_LABEL,
  examSections,
  getExam,
  getSection,
  isSectionId,
  isSelectableExam,
  type ExamId,
  type ExamMeta,
  type SectionId,
  type SectionMeta,
} from '../../lib/exams';

/** user.db kv 里保存当前考试的键（随备份导出，见 src/lib/backup） */
export const EXAM_KV_KEY = 'exam';

/** 读当前考试；没选过、或存的值不认识 / 还没上线，都返回 null（进选考试页） */
export async function readSelectedExam(user: SqlDb): Promise<ExamId | null> {
  const v = await kvGet(user, EXAM_KV_KEY);
  return isSelectableExam(v) ? v : null;
}

/**
 * 选定考试：写入 kv `exam`；如果现在没有在学的词书，就激活这门考试的默认词书
 * （每天 20 个新词，复习上限沿用默认值）。已有在学词书时不动，进度照常保留。
 */
export async function applyExamChoice(user: SqlDb, id: ExamId, now: number): Promise<void> {
  if (!isSelectableExam(id)) throw new Error(`${getExam(id).name}即将推出，暂时不能选`);
  const exam = getExam(id);
  if (exam.defaultBookId && !(await getActivePlan(user))) {
    await activatePlan(
      user,
      exam.defaultBookId,
      { dailyNew: DEFAULT_DAILY_NEW, dailyReviewCap: DEFAULT_DAILY_REVIEW_CAP },
      now,
    );
  }
  await kvSet(user, EXAM_KV_KEY, id);
}

export async function getSelectedExam(): Promise<ExamId | null> {
  const { user } = await getDatabases();
  return readSelectedExam(user);
}

export async function chooseExam(id: ExamId, now: number = Date.now()): Promise<void> {
  const { user } = await getDatabases();
  await applyExamChoice(user, id, now);
  notifyDataChanged();
}

/** 当前考试（页面聚焦、数据变化时自动刷新）；data 为 null 表示还没选 */
export function useSelectedExam() {
  return useLoader(getSelectedExam);
}
