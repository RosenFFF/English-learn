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

export const VALID_PAYLOADS: Record<QuestionType, Record<string, unknown>> = {
  banked_cloze: {
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
    title: 'Why Cities Plant Trees',
    paragraphs: 'ABCDEFGHIJ'.split('').map((label) => ({ label, text: `Paragraph ${label}.` })),
    statements: 'ABCDEFGHIA'.split('').map((answer, i) => ({
      text: `Statement ${i + 1}.`,
      answer,
      explanation: `同义改写对应 ${answer} 段。`,
    })),
  },
  careful_reading: {
    passage: 'A passage about sleep and memory.',
    questions: (['A', 'B', 'C', 'D', 'A'] as const).map((a, i) => choice(`Q${i + 1}`, a)),
  },
  translation: {
    source: '中国的茶文化历史悠久，饮茶在中国已有几千年的历史。',
    reference:
      'China has a long history of tea culture; tea drinking dates back thousands of years.',
    explanation: '「历史悠久」可译为 have a long history。',
  },
  essay: {
    title: 'The Value of Lifelong Learning',
    directions:
      'Directions: For this part, you are allowed 30 minutes to write an essay on the value of lifelong learning.',
    minWords: 150,
    maxWords: 200,
    explanation: '三段式：观点、理由、结论。',
  },
  long_conversation: {
    transcript: [
      { speaker: 'W', text: 'Hi, how was the trip?' },
      { speaker: 'M', text: 'Great, thanks.' },
    ],
    questions: (['A', 'B', 'C', 'D'] as const).map((a, i) => choice(`L${i + 1}`, a)),
  },
  passage: {
    transcript: [{ speaker: 'Narrator', text: 'A short news report.' }],
    questions: (['B', 'C', 'D'] as const).map((a, i) => choice(`P${i + 1}`, a)),
  },
  lecture: {
    transcript: [{ speaker: 'Lecturer', text: 'Today we discuss urban heat islands.' }],
    questions: (['D', 'C', 'B', 'A'] as const).map((a, i) => choice(`T${i + 1}`, a)),
  },
};

export const VALID_TRANSLATION_FEEDBACK = {
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

export const VALID_ESSAY_FEEDBACK = {
  score: 8,
  summary: '基本切题，语言错误较多。',
  issues: [{ excerpt: 'peoples is', problem: '主谓不一致', suggestion: 'people are' }],
  rewrite: 'Lifelong learning matters because ...',
};
