/**
 * 翻译、写作的原创测试数据（单测和 e2e 的模拟大模型用；App 本身不带示例题）。
 * 全部为本项目原创，不取自任何真题。
 */
import type { EssayFeedback, GeneratedPayloadOf, TranslationFeedback } from '../schemas';

export const DEMO_TRANSLATION: GeneratedPayloadOf<'translation'> = {
  topic: 'high-speed rail in China',
  source:
    '近二十年来，中国建成了世界上规模最大的高速铁路网。高铁把许多城市之间的旅行时间缩短了一半以上，' +
    '让人们可以在一天之内往返于相距上千公里的两地。与飞机相比，高铁更准时，也更舒适，票价也是普通家庭能够负担的。对于在外地工作的年轻人来说，回家看望父母变得更加方便。' +
    '高铁还带动了沿线小城市的发展，吸引了游客和投资。如今，乘坐高铁出行已经成为许多中国家庭生活的一部分。',
  reference:
    'Over the past two decades, China has built the largest high-speed rail network in the world. ' +
    'High-speed trains have cut travel time between many cities by more than half, allowing people to make a round trip between places more than a thousand kilometres apart within a single day. Compared with planes, high-speed trains are more punctual and more comfortable, and their fares are affordable for ordinary families. ' +
    'For young people working away from home, visiting their parents has become much more convenient. ' +
    'High-speed rail has also boosted the development of small cities along the lines, attracting tourists and investment. ' +
    'Today, travelling by high-speed train has become part of life for many Chinese families.',
  explanation:
    '「规模最大的」用 the largest；「缩短了一半以上」可译为 cut … by more than half；「带动……发展」可用 boost the development of。',
};

export const DEMO_ESSAY: GeneratedPayloadOf<'essay'> = {
  topic: 'part-time jobs for college students',
  title: 'Should College Students Take Part-time Jobs?',
  directions:
    'Directions: For this part, you are allowed 30 minutes to write an essay on whether college students should take part-time jobs. You should write at least 150 words but no more than 200 words.',
  minWords: 150,
  maxWords: 200,
  explanation:
    '先表明立场，再用两到三个理由（经济独立、积累经验、时间管理）展开，最后提醒兼顾学业。',
};

/** 学生译文（e2e 里输入） */
export const SAMPLE_TRANSLATION_ANSWER =
  'In the last twenty years, China built the biggest high speed railway network of the world. ' +
  'The high-speed train make the travel time between many cities shorter more than half, so people can go and come back between two places which are thousand kilometres far in one day. ' +
  'For young people who work in other places, it is more convenient to go home to see parents. ' +
  'High-speed rail also helps small cities along the line to develop and attracts tourists and investment. ' +
  'Now taking high-speed train has become a part of many Chinese families life.';

/** 学生作文（e2e 里输入，约 110 词，短于建议字数） */
export const SAMPLE_ESSAY_ANSWER =
  'Nowadays, more and more college students take part-time jobs. In my opinion, it is a good thing, but students should not forget their study.\n\n' +
  'First, a part-time job can help students earn some money and become independent. They do not need to ask their parents for everything. ' +
  'Second, working outside the campus gives students real experience. They learn how to talk with people and how to solve problems, which is useful for their future career.\n\n' +
  'However, if a student works too much, he will be tired and his grades may go down. So we should choose a suitable job and manage our time well.';

export const DEMO_TRANSLATION_FEEDBACK: TranslationFeedback = {
  score: 10,
  band: 11,
  summary: '译文基本完整，意思大体准确，但有若干语法错误和不地道的表达。',
  criteria: [
    { key: 'accuracy', level: 'good', comment: '各句意思都译出来了，没有漏译。' },
    { key: 'vocabulary', level: 'fair', comment: '「规模最大」「带动发展」的用词偏简单。' },
    { key: 'grammar', level: 'weak', comment: '时态、主谓一致和所有格都有错误。' },
    { key: 'fluency', level: 'fair', comment: '第二句过长，读起来不够顺。' },
  ],
  sentences: [
    {
      original:
        'In the last twenty years, China built the biggest high speed railway network of the world.',
      problem: '时态应用现在完成时；「世界上」应为 in the world；high-speed 需要连字符。',
      improvement:
        'Over the past two decades, China has built the largest high-speed rail network in the world.',
    },
    {
      original:
        'The high-speed train make the travel time between many cities shorter more than half, …',
      problem: '主谓不一致（train make）；「缩短一半以上」表达生硬。',
      improvement:
        'High-speed trains have cut travel time between many cities by more than half, …',
    },
    {
      original: 'Now taking high-speed train has become a part of many Chinese families life.',
      problem: '所有格错误（families life），train 前缺冠词。',
      improvement:
        'Today, travelling by high-speed train has become part of life for many Chinese families.',
    },
  ],
  rewrite:
    'Over the past twenty years, China has built the biggest high-speed rail network in the world. ' +
    'High-speed trains have cut travel time between many cities by more than half, so people can make a round trip between two places a thousand kilometres apart in one day. ' +
    'For young people working in other cities, going home to visit their parents has become more convenient. ' +
    'High-speed rail has also helped small cities along the lines develop and attracted tourists and investment. ' +
    "Now, travelling by high-speed train has become part of many Chinese families' lives.",
};

export const DEMO_ESSAY_FEEDBACK: EssayFeedback = {
  score: 8,
  band: 8,
  summary: '观点明确、结构清楚，但篇幅不足 150 词，论证展开不够，语言较为简单。',
  criteria: [
    { key: 'content', level: 'fair', comment: '切题，但每个理由只有一句话，缺少例子。' },
    {
      key: 'organization',
      level: 'good',
      comment: '三段式清楚，First / Second / However 衔接自然。',
    },
    {
      key: 'vocabulary',
      level: 'fair',
      comment: '用词较基础，可换用 financially independent 等表达。',
    },
    { key: 'grammar', level: 'fair', comment: '少量搭配问题（forget their study）。' },
  ],
  issues: [
    {
      excerpt: 'but students should not forget their study',
      problem: '搭配不当，study 作「学业」时常用 studies。',
      suggestion: 'but they should never neglect their studies',
    },
    {
      excerpt: 'if a student works too much, he will be tired',
      problem: '用 he 泛指学生不够中性，可改为复数。',
      suggestion: 'if students work too many hours, they may become exhausted',
    },
  ],
  rewrite:
    'Nowadays, an increasing number of college students take part-time jobs. In my view, this is a worthwhile choice, provided that they never neglect their studies.\n\n' +
    'To begin with, a part-time job allows students to earn money and become financially independent. ' +
    'More importantly, working off campus offers real-world experience: students learn to communicate with others and to solve practical problems, skills that will benefit their future careers.\n\n' +
    'Nevertheless, working too many hours can leave students exhausted and harm their grades. Therefore, students should choose suitable jobs and manage their time wisely.',
};

const LONG_WORD = 'internationalization';
const LONG_TAIL =
  ' Meanwhile, counterintuitively, the overwhelmingly disproportionate characteristics of uncharacteristically incomprehensible interdisciplinary microorganisms remained indistinguishable.';

/** 压测：超长原文 / 题目 / 点评 */
export const STRESS_TRANSLATION: GeneratedPayloadOf<'translation'> = {
  ...DEMO_TRANSLATION,
  source: DEMO_TRANSLATION.source.repeat(3),
};

export const STRESS_ESSAY: GeneratedPayloadOf<'essay'> = {
  ...DEMO_ESSAY,
  title: `${DEMO_ESSAY.title} The ${LONG_WORD}ally Counterintuitive Economics of Campus Life`,
  directions: DEMO_ESSAY.directions + LONG_TAIL.repeat(3),
};

export const STRESS_TRANSLATION_FEEDBACK: TranslationFeedback = {
  ...DEMO_TRANSLATION_FEEDBACK,
  summary: DEMO_TRANSLATION_FEEDBACK.summary + LONG_TAIL,
  criteria: DEMO_TRANSLATION_FEEDBACK.criteria.map((c) => ({
    ...c,
    comment: c.comment + LONG_TAIL,
  })),
  rewrite: `${LONG_WORD}${LONG_WORD} ${DEMO_TRANSLATION_FEEDBACK.rewrite}${LONG_TAIL.repeat(4)}`,
  sentences: DEMO_TRANSLATION_FEEDBACK.sentences.map((s) => ({
    ...s,
    original: s.original + LONG_TAIL,
    improvement: `${LONG_WORD}${LONG_WORD} ${s.improvement}`,
  })),
};

export const STRESS_ESSAY_FEEDBACK: EssayFeedback = {
  ...DEMO_ESSAY_FEEDBACK,
  issues: DEMO_ESSAY_FEEDBACK.issues.map((s) => ({ ...s, excerpt: s.excerpt + LONG_TAIL })),
  rewrite: DEMO_ESSAY_FEEDBACK.rewrite + LONG_TAIL.repeat(4),
};

/** 超长作答（压测输入框，不超过翻译输入上限 2000 字符） */
export const STRESS_ANSWER =
  `${LONG_WORD}${LONG_WORD}${LONG_WORD} ${SAMPLE_ESSAY_ANSWER} ${LONG_TAIL.repeat(6)}`.slice(
    0,
    2000,
  );

/** 模拟大模型的评分输出：band 由代码按分数算（bandForScore），模型不返回 */
export function asModelOutput<F extends { band?: unknown }>(fb: F): Omit<F, 'band'> {
  const { band: _band, ...rest } = fb;
  return rest;
}
