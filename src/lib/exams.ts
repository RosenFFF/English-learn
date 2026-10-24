/**
 * 考试与板块的元数据（纯 TS，不依赖 React / Expo）。
 * 路由白名单、题库表的考试/题型字段都以这里的 id 为准。
 */

export const EXAM_IDS = ['cet6', 'kaoyan', 'ielts'] as const;
export type ExamId = (typeof EXAM_IDS)[number];

export const SECTION_IDS = [
  'vocab',
  'reading',
  'translation',
  'writing',
  'listening',
  'mistakes',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export type ExamStatus = 'available' | 'coming_soon';

export interface SectionMeta {
  id: SectionId;
  /** 中文标题，卡片和页面标题用 */
  title: string;
  /** 一句话说明这个板块练什么 */
  description: string;
  /** 是否已上线；未上线的板块进占位页 */
  available: boolean;
}

export interface ExamMeta {
  id: ExamId;
  /** 全称，如「大学英语六级」 */
  name: string;
  /** 简称，如「六级」 */
  shortName: string;
  /** 选考试页卡片上的一句话 */
  tagline: string;
  status: ExamStatus;
  /** 这门考试首页的板块，按显示顺序 */
  sections: readonly SectionId[];
  /** 选这门考试时，没有在学词书就自动用这本（words.db 的 book.id） */
  defaultBookId: string | null;
}

export const SECTIONS: Readonly<Record<SectionId, SectionMeta>> = {
  vocab: {
    id: 'vocab',
    title: '词汇',
    description: '用 FSRS 间隔重复背六级词书，每天新词加复习。',
    available: true,
  },
  reading: {
    id: 'reading',
    title: '阅读',
    description: '选词填空、长篇阅读（段落匹配）和仔细阅读三种题型。',
    // 作答界面已上线；接题库（PR-B）之前先用内置的原创示例题
    available: true,
  },
  translation: {
    id: 'translation',
    title: '翻译',
    description: '一段汉译英，按六级评分标准打分并逐句点评。',
    available: false,
  },
  writing: {
    id: 'writing',
    title: '写作',
    description: '按题目写作文，15 分制打分，指出问题并给出改写示范。',
    available: false,
  },
  listening: {
    id: 'listening',
    title: '听力',
    description: '长对话、短文和讲座：先听朗读做题，做完再看原文。',
    available: false,
  },
  mistakes: {
    id: 'mistakes',
    title: '错题本',
    description: '集中回顾做错的题和练习记录。',
    available: false,
  },
};

export const EXAMS: readonly ExamMeta[] = [
  {
    id: 'cet6',
    name: '大学英语六级',
    shortName: '六级',
    tagline: '词汇、阅读、翻译、写作、听力',
    status: 'available',
    sections: SECTION_IDS,
    defaultBookId: 'cet6',
  },
  {
    id: 'kaoyan',
    name: '考研英语',
    shortName: '考研',
    tagline: '英语一 / 英语二',
    status: 'coming_soon',
    sections: [],
    defaultBookId: 'kaoyan',
  },
  {
    id: 'ielts',
    name: '雅思',
    shortName: '雅思',
    tagline: '学术类 / 培训类',
    status: 'coming_soon',
    sections: [],
    defaultBookId: 'ielts',
  },
];

export const STATUS_LABEL: Readonly<Record<ExamStatus, string>> = {
  available: '可以开始',
  coming_soon: '即将推出',
};

export function isExamId(v: unknown): v is ExamId {
  return typeof v === 'string' && (EXAM_IDS as readonly string[]).includes(v);
}

/** 已上线、可以选的考试（kv `exam` 只接受这些值） */
export function isSelectableExam(v: unknown): v is ExamId {
  return isExamId(v) && getExam(v).status === 'available';
}

export function getExam(id: ExamId): ExamMeta {
  const exam = EXAMS.find((e) => e.id === id);
  if (!exam) throw new Error(`未知考试：${id}`);
  return exam;
}

export function isSectionId(v: unknown): v is SectionId {
  return typeof v === 'string' && (SECTION_IDS as readonly string[]).includes(v);
}

export function getSection(id: SectionId): SectionMeta {
  return SECTIONS[id];
}

/** 某门考试首页的板块（按顺序） */
export function examSections(id: ExamId): SectionMeta[] {
  return getExam(id).sections.map(getSection);
}
