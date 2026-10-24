/** 单测用：每种题型一份合格的 payload，以及合格的评分结果 */
import type { QuestionType } from '../types';

const words = [
  'abundant',
  'barely',
  'cultivate',
  'decline',
  'essential',
  'foster',
  'gradually',
  'hinder',
  'inevitable',
  'justify',
  'keen',
  'legacy',
  'mutual',
  'notion',
  'obscure',
];

const choice = (stem: string, answer: 'A' | 'B' | 'C' | 'D') => ({
  stem,
  options: [`${stem} option 1`, `${stem} option 2`, `${stem} option 3`, `${stem} option 4`],
  answer,
  explanation: '定位到第二段。',
});

/** 恰好 n 个英文词的一段朗读文字（label 计入词数） */
export function speech(n: number, label: string): string {
  const head = label.split(' ');
  const filler = 'people often talk about city life and the changes it brings'.split(' ');
  const out = [...head];
  for (let i = 0; out.length < n; i++) out.push(filler[i % filler.length]);
  return out.slice(0, n).join(' ') + '.';
}

export const VALID_PAYLOADS: Record<QuestionType, Record<string, unknown>> = {
  banked_cloze: {
    topic: 'remote work',
    passage: Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1} has a {{${i + 1}}} gap.`).join(
      ' ',
    ),
    options: words,
    blanks: [2, 0, 5, 7, 1, 9, 4, 12, 13, 11].map((answer) => ({
      answer,
      explanation: '根据词性和上下文判断。',
    })),
  },
  matching: {
    topic: 'urban trees',
    title: 'Why Cities Plant Trees',
    paragraphs: 'ABCDEFGHIJ'.split('').map((label) => ({ label, text: `Paragraph ${label}.` })),
    statements: 'ABCDEFGHIA'.split('').map((answer, i) => ({
      text: `Statement ${i + 1}.`,
      answer,
      explanation: `同义改写对应 ${answer} 段。`,
    })),
  },
  careful_reading: {
    topic: 'sleep and memory',
    passage: 'A passage about sleep and memory.',
    questions: (['A', 'B', 'C', 'D', 'A'] as const).map((a, i) => choice(`Q${i + 1}`, a)),
  },
  translation: {
    topic: 'Chinese tea culture',
    source: '中国的茶文化历史悠久，饮茶在中国已有几千年的历史。',
    reference:
      'China has a long history of tea culture; tea drinking dates back thousands of years.',
    explanation: '「历史悠久」可译为 have a long history。',
  },
  essay: {
    topic: 'lifelong learning',
    title: 'The Value of Lifelong Learning',
    directions:
      'Directions: For this part, you are allowed 30 minutes to write an essay on the value of lifelong learning.',
    minWords: 150,
    maxWords: 200,
    explanation: '三段式：观点、理由、结论。',
  },
  long_conversation: {
    topic: 'a business trip',
    roles: [
      { id: 'W', name: 'Woman', gender: 'female' },
      { id: 'M', name: 'Man', gender: 'male' },
    ],
    script: Array.from({ length: 8 }, (_, i) => ({
      speaker: i % 2 === 0 ? 'W' : 'M',
      text: speech(30, `turn ${i + 1}`),
    })),
    questions: (['A', 'B', 'C', 'D'] as const).map((a, i) => choice(`L${i + 1}`, a)),
  },
  passage: {
    topic: 'local news',
    roles: [{ id: 'N', name: 'Narrator', gender: 'male' }],
    script: [
      { speaker: 'N', text: speech(120, 'part one') },
      { speaker: 'N', text: speech(100, 'part two') },
    ],
    questions: (['B', 'C', 'D'] as const).map((a, i) => choice(`P${i + 1}`, a)),
  },
  lecture: {
    topic: 'urban heat islands',
    roles: [{ id: 'L', name: 'Professor Lee', gender: 'female' }],
    script: [
      { speaker: 'L', text: speech(150, 'introduction') },
      { speaker: 'L', text: speech(150, 'main point') },
    ],
    questions: (['D', 'C', 'B', 'A'] as const).map((a, i) => choice(`T${i + 1}`, a)),
  },
};

/** schema v1、v2 时期的听力题（transcript 旧结构，没有角色表） */
export const LEGACY_LISTENING_PAYLOADS = {
  long_conversation: {
    topic: 'a business trip',
    transcript: [
      { speaker: 'W', text: 'Hi, how was the trip?' },
      { speaker: 'M', text: 'Great, thanks.' },
    ],
    questions: (['A', 'B', 'C', 'D'] as const).map((a, i) => choice(`L${i + 1}`, a)),
  },
  passage: {
    topic: 'local news',
    transcript: [{ speaker: 'Narrator', text: 'A short news report.' }],
    questions: (['B', 'C', 'D'] as const).map((a, i) => choice(`P${i + 1}`, a)),
  },
  lecture: {
    topic: 'urban heat islands',
    transcript: [{ speaker: 'Lecturer', text: 'Today we discuss urban heat islands.' }],
    questions: (['D', 'C', 'B', 'A'] as const).map((a, i) => choice(`T${i + 1}`, a)),
  },
};

/** v2 翻译点评（当前结构） */
export const VALID_TRANSLATION_FEEDBACK = {
  score: 10,
  band: 11,
  summary: '意思基本准确，个别搭配不当。',
  criteria: [
    { key: 'accuracy', level: 'good', comment: '意思基本都译出来了。' },
    { key: 'vocabulary', level: 'fair', comment: '「茶文化」的搭配不够地道。' },
    { key: 'grammar', level: 'weak', comment: '第一句缺少谓语。' },
    { key: 'fluency', level: 'fair', comment: '句子之间缺少衔接。' },
  ],
  sentences: [
    {
      original: 'China tea culture long.',
      problem: '缺少谓语',
      improvement: 'China has a long tea culture.',
    },
  ],
  rewrite: 'China has a long history of tea culture.',
};

/** v2 写作点评（当前结构） */
export const VALID_ESSAY_FEEDBACK = {
  score: 8,
  band: 8,
  summary: '基本切题，语言错误较多。',
  criteria: [
    { key: 'content', level: 'fair', comment: '切题，但论据单薄。' },
    { key: 'organization', level: 'fair', comment: '段落之间缺少过渡。' },
    { key: 'vocabulary', level: 'fair', comment: '用词重复。' },
    { key: 'grammar', level: 'weak', comment: '主谓一致错误较多。' },
  ],
  issues: [{ excerpt: 'peoples is', problem: '主谓不一致', suggestion: 'people are' }],
  rewrite: 'Lifelong learning matters because ...',
};

/** v1 时期存库的翻译点评（没有 version、criteria、rewrite） */
export const V1_TRANSLATION_FEEDBACK = {
  score: 10,
  band: 11,
  summary: '意思基本准确，个别搭配不当。',
  sentences: [
    {
      original: 'China tea culture long.',
      problem: '缺少谓语',
      improvement: 'China has a long tea culture.',
    },
  ],
};

/** v1 时期存库的写作点评（没有 version、band、criteria） */
export const V1_ESSAY_FEEDBACK = {
  score: 8,
  summary: '基本切题，语言错误较多。',
  issues: [{ excerpt: 'peoples is', problem: '主谓不一致', suggestion: 'people are' }],
  rewrite: 'Lifelong learning matters because ...',
};
