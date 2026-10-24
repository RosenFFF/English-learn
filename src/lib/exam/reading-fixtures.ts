/**
 * 阅读的本地示例题（原创短文，不取自任何真题），PR-B 合并、接上题库后只留给单测和压测用。
 */
import { letterOf, type ReadingSet } from './reading';
import type {
  BankedClozePayload,
  CarefulReadingPayload,
  ChoiceLetter,
  MatchingPayload,
  ReadingQuestionType,
} from './reading-types';

// ---------- 选词填空 ----------

const CLOZE_WORDS = [
  'abandon',
  'barely',
  'bear',
  'compensate',
  'considerable',
  'coordinate',
  'fragile',
  'integral',
  'pressure',
  'regular',
  'reluctantly',
  'scarcity',
  'subsidies',
  'transform',
  'trapped',
];

/** 第 n 空（从 1 起）的答案词和解析 */
const CLOZE_KEY: [string, string][] = [
  ['transform', 'begin to 后接动词原形，transform…into… 表示「把……改造成……」。'],
  ['trapped', 'would otherwise be 后接过去分词，热量被混凝土「困住」。'],
  ['pressure', 'reduce the pressure on 表示「减轻……的负担」，空前有冠词 the，需要名词。'],
  ['barely', '修饰动词 knew，「以前几乎不认识彼此」，与后文 now meet 形成对比。'],
  ['coordinate', 'to 后接动词原形，委员会「协调」这项工作。'],
  ['regular', '冠词 a 与名词 reason 之间需要形容词，「经常出门的理由」。'],
  ['bear', 'strong enough to 后接动词原形，bear the load 表示「承受重量」。'],
  ['considerable', 'be 动词后作表语的形容词，成本「相当高」，与后文买不起呼应。'],
  ['subsidies', 'offer 后接名词，政府为结构检测提供「补贴」，用复数。'],
  ['integral', 'an 后接元音开头的形容词，an integral part of 表示「不可或缺的一部分」。'],
];

/** 题目形状 = PR-B 的 BankedClozePayload（没有标题，答案是候选词下标） */
export const DEMO_BANKED_CLOZE: BankedClozePayload = {
  passage:
    'In many crowded cities, rooftops have long been treated as wasted space, covered with gravel and forgotten machinery. Over the past decade, however, a growing number of residents have begun to {{1}} these flat surfaces into small gardens. The trend is not merely decorative. Plants on a roof take in heat that would otherwise be {{2}} by concrete, which can cool the rooms below by several degrees in summer. They also slow the flow of rainwater, reducing the {{3}} on drainage systems during heavy storms.\n\n' +
    'Supporters argue that rooftop gardens offer social benefits as well. Neighbours who once {{4}} knew each other’s names now meet to share seeds and tools, and some buildings have formed committees to {{5}} the work. For elderly residents in particular, a garden can provide a {{6}} reason to leave the apartment and spend time outdoors.\n\n' +
    'The idea is not without its critics. Engineers warn that soil, especially when soaked, is surprisingly heavy, and older roofs may not be strong enough to {{7}} the extra load. Installation costs can also be {{8}}, putting such projects out of reach for the low-income neighbourhoods that might benefit most. To address these concerns, several city governments now offer {{9}} for structural checks and publish guidelines on lightweight growing materials. If that support continues, the quiet green patches above our heads may become an {{10}} part of city life.',
  options: CLOZE_WORDS,
  blanks: CLOZE_KEY.map(([word, explanation]) => ({
    answer: CLOZE_WORDS.indexOf(word),
    explanation,
  })),
};

// ---------- 长篇阅读（段落匹配） ----------

const NIGHT_TRAIN_PARAGRAPHS = [
  'Ten years ago, the overnight train in Europe looked like a relic. Budget airlines were offering cross-border flights for the price of a dinner, and one operator after another quietly cut its sleeper routes. Today the picture is very different: new night services link cities such as Vienna, Brussels, Paris and Prague, and many of them sell out weeks in advance.',
  'The decline had clear causes. A sleeper carriage earns money only once every twenty-four hours, while a daytime train can make several round trips. Night services also compete for track time with maintenance crews, who usually do their work after dark, and they need more staff on board than an ordinary train.',
  'Much of the recent demand comes from travellers who worry about their impact on the climate. A seat on an overnight train produces only a small fraction of the emissions of a short-haul flight, and some companies now encourage employees to take the train for business trips under a certain distance.',
  'Supporters also point to a simple practical advantage. Passengers board in the evening, sleep through the journey and step out in the middle of a city the next morning. They save the cost of a hotel room and, unlike air travellers, they lose no part of the working day to airport queues.',
  'Governments have played a part as well. When other operators withdrew, Austria’s state railway took over several abandoned routes and ordered new carriages. France reopened a line between Paris and the Mediterranean coast with public money, arguing that rail links matter for regions far from the capital.',
  'Not every passenger is impressed. Some of the carriages in service are decades old, with cramped compartments and air conditioning that works only some of the time. Delays of several hours are not unusual, and on popular dates a bed on the train can cost more than a flight to the same destination.',
  'Buying a ticket can be the hardest part of the trip. Europe has no single booking system for international rail, so a journey that crosses three countries may require three separate purchases, each with its own conditions. Travel agents say the complexity drives many customers back to the airlines.',
  'There are technical obstacles, too. National networks were built to different standards, with different signalling systems and electrical voltages. At some borders a locomotive must be changed or the crew replaced, which adds time and cost to every journey.',
  'To win over a younger generation, operators are rethinking the inside of the train. One new design offers compact private pods for people travelling alone, each with a lockable door, a phone charger and a small window, at a lower price than a full cabin.',
  'Private start-ups have also entered the market, leasing old carriages and raising money from future passengers through crowdfunding. Several have launched successful summer routes, but their founders admit that it is still unclear whether year-round night trains can make a profit.',
  'Transport experts expect night trains to remain a niche rather than a replacement for aviation. They are most competitive on journeys of roughly 800 to 1,500 kilometres: too long for a comfortable day on the train, but short enough that flying saves little time once airport transfers are included.',
];

const NIGHT_TRAIN_STATEMENTS: [string, number, string][] = [
  [
    'On busy days, a sleeper berth may be more expensive than a plane ticket.',
    5,
    'F 段末句：a bed on the train can cost more than a flight。',
  ],
  [
    'Night trains earn less because each carriage can only be used for one journey a day.',
    1,
    'B 段：earns money only once every twenty-four hours。',
  ],
  [
    'Arriving in a city centre in the morning means travellers do not lose working time.',
    3,
    'D 段：they lose no part of the working day。',
  ],
  [
    'A cross-border journey often has to be booked as several separate tickets.',
    6,
    'G 段：three separate purchases。',
  ],
  [
    'Night trains are expected to be most useful for trips of medium length.',
    10,
    'K 段：800 to 1,500 kilometres。',
  ],
  [
    'A state-owned company stepped in to run routes that others had dropped.',
    4,
    'E 段：Austria’s state railway took over several abandoned routes。',
  ],
  [
    'Differences between national rail systems slow journeys down at borders.',
    7,
    'H 段：different signalling systems and electrical voltages。',
  ],
  [
    'Concern about emissions has encouraged more people to travel by rail.',
    2,
    'C 段：travellers who worry about their impact on the climate。',
  ],
  [
    'Repair work on the tracks usually happens at the same time as night services run.',
    1,
    'B 段：maintenance crews… do their work after dark。B 段第二次被选。',
  ],
  [
    'Not long ago, it seemed that overnight trains might disappear entirely.',
    0,
    'A 段：looked like a relic，运营商纷纷砍掉线路。',
  ],
];

/** 题目形状 = PR-B 的 MatchingPayload */
export const DEMO_MATCHING: MatchingPayload = {
  title: 'The Return of the Night Train',
  paragraphs: NIGHT_TRAIN_PARAGRAPHS.map((text, i) => ({ label: letterOf(i), text })),
  statements: NIGHT_TRAIN_STATEMENTS.map(([text, para, explanation]) => ({
    text,
    answer: letterOf(para),
    explanation,
  })),
};

// ---------- 仔细阅读 ----------

type Q = [stem: string, options: [string, string, string, string], answer: number, why: string];

const LETTERS: readonly ChoiceLetter[] = ['A', 'B', 'C', 'D'];

function questions(qs: Q[]): CarefulReadingPayload['questions'] {
  return qs.map(([stem, options, answer, explanation]) => ({
    stem,
    options,
    answer: LETTERS[answer] ?? 'A',
    explanation,
  }));
}

/** 两篇 = 两道 careful_reading 题；形状 = PR-B 的 CarefulReadingPayload（没有标题） */
export const DEMO_CAREFUL: CarefulReadingPayload[] = [
  {
    passage:
      'Most of us treat boredom as a problem to be solved as quickly as possible. A few seconds of waiting in a queue is enough to make us reach for a phone. Yet a number of psychologists now argue that this habit may come at a cost, because boredom appears to serve a useful purpose.\n\n' +
      'In one widely discussed experiment, volunteers were first asked to copy numbers from a telephone directory for fifteen minutes, a deliberately dull task. They were then asked to think of as many uses as possible for a pair of plastic cups. Compared with a group that had skipped the dull task, the bored volunteers came up with more ideas, and their ideas were judged more original.\n\n' +
      'Researchers suggest that boredom works as a signal. It tells us that our current activity is not rewarding and pushes the mind to wander in search of something better. That wandering, in turn, gives the brain room to make unexpected connections. When every empty moment is filled with messages and short videos, the signal is switched off before it can do its job.\n\n' +
      'None of this means that boredom is always good. Long periods of it, especially at work or at school, are linked with lower motivation and poorer health. The point, the researchers say, is balance: allowing ourselves short spells of having nothing to do, rather than escaping from them automatically.',
    questions: questions([
      [
        'What does the author say about most people’s attitude towards boredom?',
        [
          'They see it as a sign of creativity.',
          'They try to end it almost immediately.',
          'They enjoy it during short waits.',
          'They believe it improves their health.',
        ],
        1,
        '第一段：treat boredom as a problem to be solved as quickly as possible，几秒钟就拿手机。',
      ],
      [
        'Why were some volunteers asked to copy numbers from a directory?',
        [
          'To test how fast they could work.',
          'To measure their memory for numbers.',
          'To make them feel bored before the next task.',
          'To compare their handwriting with others.',
        ],
        2,
        '第二段：a deliberately dull task，目的是先让他们无聊。',
      ],
      [
        'What did the experiment find?',
        [
          'Bored volunteers produced more and better ideas.',
          'Both groups performed equally well.',
          'Volunteers who skipped the task were more original.',
          'Dull tasks made volunteers give up quickly.',
        ],
        0,
        '第二段末：came up with more ideas, and their ideas were judged more original。',
      ],
      [
        'According to the researchers, what happens when every empty moment is filled?',
        [
          'The brain becomes more efficient.',
          'Boredom loses its useful effect.',
          'People feel bored more often.',
          'Short videos become less enjoyable.',
        ],
        1,
        '第三段：the signal is switched off before it can do its job。',
      ],
      [
        'What is the author’s main suggestion in the last paragraph?',
        [
          'Avoid boredom at work and at school.',
          'Spend long periods doing nothing.',
          'Accept short moments of boredom instead of always escaping them.',
          'Replace phones with books during waits.',
        ],
        2,
        '末段：The point… is balance: allowing ourselves short spells of having nothing to do。',
      ],
    ]),
  },
  {
    passage:
      'On the first Saturday of every month, a community hall in a small northern town fills with broken objects: toasters that no longer heat, lamps with loose wires, trousers with torn pockets. Volunteers with tools and sewing machines sit at long tables, and visitors wait their turn to have their belongings repaired for free.\n\n' +
      'Events like this, often called repair cafés, have spread to thousands of towns over the past fifteen years. Their organisers describe two goals. The first is environmental: every item that is fixed is one less item sent to a landfill. The second is educational. Visitors are expected to stay and watch, and ideally to help, so that they can manage simple repairs on their own next time.\n\n' +
      'Volunteers say the biggest obstacle is not a lack of skill but the design of modern products. Many devices are glued shut or held together with unusual screws, and spare parts can be hard to find. Some manufacturers argue that sealed designs make products thinner and more resistant to water. Critics reply that the real effect is to push customers towards buying replacements.\n\n' +
      'Lawmakers in several countries have begun to respond with “right to repair” rules, which require companies to sell spare parts and publish repair manuals for a number of years. It is too early to judge their effect, but repair café volunteers welcome them. As one retired electrician put it, “Most things aren’t really broken. They’re just waiting for someone who knows where to look.”',
    questions: questions([
      [
        'What happens at the community hall once a month?',
        [
          'Old objects are sold at low prices.',
          'People bring broken items to be fixed free of charge.',
          'Volunteers collect waste for a landfill.',
          'Shops display their newest products.',
        ],
        1,
        '第一段：visitors wait their turn to have their belongings repaired for free。',
      ],
      [
        'Why are visitors encouraged to stay and watch?',
        [
          'So that they can learn to do simple repairs themselves.',
          'So that volunteers can work more quickly.',
          'Because the hall has limited space.',
          'Because the repairs need their permission.',
        ],
        0,
        '第二段：so that they can manage simple repairs on their own next time。',
      ],
      [
        'What do volunteers see as the main difficulty?',
        [
          'Visitors who lack patience.',
          'A shortage of skilled helpers.',
          'Products that are designed to be hard to open and fix.',
          'The high cost of tools.',
        ],
        2,
        '第三段：not a lack of skill but the design of modern products。',
      ],
      [
        'How do critics view sealed product designs?',
        [
          'As a way to make products safer.',
          'As a result of customer demand.',
          'As necessary for water resistance.',
          'As a way to encourage people to buy new products.',
        ],
        3,
        '第三段末：push customers towards buying replacements。',
      ],
      [
        'What does the retired electrician’s remark suggest?',
        [
          'Many items considered broken can still be repaired.',
          'Most repairs require professional training.',
          'New laws will solve the problem quickly.',
          'People should stop buying electrical goods.',
        ],
        0,
        '末句：Most things aren’t really broken，只是等懂行的人来修。',
      ],
    ]),
  },
];

/** 内置示例练习：每种题型一套 */
export const DEMO_READING: Readonly<Record<ReadingQuestionType, ReadingSet>> = {
  banked_cloze: {
    id: 'demo-banked-cloze',
    type: 'banked_cloze',
    parts: [{ id: 'demo-cloze-rooftop', payload: DEMO_BANKED_CLOZE }],
  },
  matching: {
    id: 'demo-matching',
    type: 'matching',
    parts: [{ id: 'demo-matching-night-train', payload: DEMO_MATCHING }],
  },
  careful_reading: {
    id: 'demo-careful-reading',
    type: 'careful_reading',
    parts: DEMO_CAREFUL.map((payload, i) => ({ id: `demo-careful-${i + 1}`, payload })),
  },
};

// ---------- 压测（break-ui）：超长单词、超长段落、长标题 ----------

const LONG_WORD = 'internationalization';
const LONG_TAIL =
  ' Meanwhile, counterintuitively, the overwhelmingly disproportionate characteristics of uncharacteristically incomprehensible interdisciplinary microorganisms remained indistinguishable throughout the extraordinarily longitudinal investigation.';

/** 压测版：每种题型换上超长词和超长段落，用来检查 360 宽下不溢出 */
export function stressReadingSet(type: ReadingQuestionType): ReadingSet {
  const base = DEMO_READING[type];
  switch (base.type) {
    case 'banked_cloze':
      return {
        ...base,
        id: `${base.id}-stress`,
        parts: base.parts.map((p) => ({
          ...p,
          payload: {
            ...p.payload,
            passage: p.payload.passage + LONG_TAIL.repeat(3),
            // 候选词不能重复：超长词各带编号
            options: p.payload.options.map((o, i) =>
              i % 3 === 0 ? `${LONG_WORD}${i === 0 ? 'ally-incomprehensibly' : `-${i}`}` : o,
            ),
          },
        })),
      };
    case 'matching':
      return {
        ...base,
        id: `${base.id}-stress`,
        parts: base.parts.map((p) => ({
          ...p,
          payload: {
            ...p.payload,
            title: `${p.payload.title} and the Counterintuitive Economics of Transcontinental Rail`,
            paragraphs: p.payload.paragraphs.map((x, i) =>
              i % 2 === 0 ? { ...x, text: x.text + LONG_TAIL.repeat(2) } : x,
            ),
            statements: p.payload.statements.map((st, i) =>
              i === 0 ? { ...st, text: st.text + LONG_TAIL } : st,
            ),
          },
        })),
      };
    case 'careful_reading':
      return {
        ...base,
        id: `${base.id}-stress`,
        parts: base.parts.map((p) => ({
          ...p,
          payload: {
            ...p.payload,
            passage: `${LONG_WORD}ally reconsidered. ${p.payload.passage}${LONG_TAIL.repeat(2)}`,
            questions: p.payload.questions.map((q, i) =>
              i === 0 ? { ...q, options: q.options.map((o) => o + LONG_TAIL) } : q,
            ),
          },
        })),
      };
  }
}
