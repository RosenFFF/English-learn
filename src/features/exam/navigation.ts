/** 选考试页的唯一入口：首页右上角「切换」和「我的」里的「当前考试」都走这里。 */
import { router, type Href } from 'expo-router';

import { getSection, type SectionId } from '../../lib/exams';

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

/** 已上线板块各自的页面；没在这里、或者还没上线的板块进 /section/[id] 占位页 */
const LIVE_SECTION_ROUTES: Partial<Record<SectionId, Href>> = {
  vocab: '/vocab',
  reading: '/reading',
  translation: '/translation',
  writing: '/writing',
  mistakes: '/mistakes',
};

/** 首页板块卡片点进去去哪 */
export function sectionHref(id: SectionId): Href {
  const live = getSection(id).available ? LIVE_SECTION_ROUTES[id] : undefined;
  return live ?? { pathname: '/section/[id]', params: { id } };
}

/** 已上线、有自己页面的板块（占位页据此重定向） */
export function liveSectionHref(id: SectionId): Href | null {
  return getSection(id).available ? (LIVE_SECTION_ROUTES[id] ?? null) : null;
}
