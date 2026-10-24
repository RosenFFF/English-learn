/** 选考试页的唯一入口：首页右上角「切换」和「我的」里的「当前考试」都走这里。 */
import { router } from 'expo-router';

export type ExamPickerFrom = 'home' | 'me';

const FROM_ROUTE = { home: '/home', me: '/me' } as const;

export function parseExamPickerFrom(v: unknown): ExamPickerFrom | null {
  return v === 'home' || v === 'me' ? v : null;
}

/** 从首页或「我的」打开选考试页，选完回到原来那页 */
export function openExamPicker(from: ExamPickerFrom): void {
  router.push({ pathname: '/choose-exam', params: { from } });
}

/** 选完考试之后去哪：首次启动（没有来源）进首页；有来源就回到来源页 */
export function leaveExamPicker(from: ExamPickerFrom | null): void {
  if (from && router.canGoBack()) router.back();
  else router.replace(from ? FROM_ROUTE[from] : '/home');
}
