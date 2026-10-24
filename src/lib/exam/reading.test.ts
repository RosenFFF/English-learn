import { cet6PaperScore, CET6_READING_WEIGHTS } from './cet6-score';
import {
  answeredCount,
  answersByPart,
  createSheet,
  gradeSheet,
  itemsOf,
  needsExitConfirm,
  nextUnanswered,
  partOffsets,
  sheetReducer,
  splitClozePassage,
  submitPrompt,
  unansweredCount,
  usedValues,
  valueLabel,
  type AnswerSheet,
  type ReadingSet,
  type SheetAction,
} from './reading';
import {
  DEMO_BANKED_CLOZE,
  DEMO_CAREFUL,
  DEMO_MATCHING,
  DEMO_READING,
  stressReadingSet,
} from './__testutils__/reading-fixtures';
import { gradeObjective, type ObjectiveQuestion } from './grade';
import { READING_QUESTION_TYPES, isReadingQuestionType, isReadingSectionType } from './reading';
import {
  BANKED_CLOZE_BLANKS,
  BANKED_CLOZE_OPTIONS,
  CAREFUL_READING_QUESTIONS,
  MATCHING_STATEMENTS,
  parsePayload,
} from './schemas';
import { QUESTION_TYPES } from './types';

const run = (sheet: AnswerSheet, ...actions: SheetAction[]): AnswerSheet =>
  actions.reduce(sheetReducer, sheet);

const CLOZE = DEMO_READING.banked_cloze;
const MATCHING = DEMO_READING.matching;
const CAREFUL = DEMO_READING.careful_reading;

describe('选词填空：填词、清空、一个词只能用一次', () => {
  const fresh = () => createSheet(CLOZE);

  it('初始 10 个空全没答，焦点在第 1 空，可选值是候选词下标 0–14', () => {
    const s = fresh();
    expect(s.answers).toHaveLength(10);
    expect(s.choices[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(s.focus).toBe(0);
    expect(s.unique).toBe(true);
    expect(unansweredCount(s)).toBe(10);
  });

  it('点词填进当前空，焦点跳到下一个没填的空', () => {
    const s = run(fresh(), { type: 'pick', value: 13 });
    expect(s.answers[0]).toBe(13);
    expect(s.focus).toBe(1);
    expect(answeredCount(s)).toBe(1);
  });

  it('跳过已填的空，到末尾从头找', () => {
    const s = run(
      fresh(),
      { type: 'pick', value: 0 },
      { type: 'focus', index: 9 },
      { type: 'pick', value: 1 },
    );
    expect(s.focus).toBe(1);
    expect(nextUnanswered(s, 9)).toBe(1);
  });

  it('一个词只能用一次：已用的词不能填进别的空', () => {
    const s1 = run(fresh(), { type: 'pick', value: 2 });
    expect(run(s1, { type: 'pick', value: 2 })).toBe(s1);
    expect(run(s1, { type: 'answer', index: 5, value: 2 })).toBe(s1);
    expect([...usedValues(s1)]).toEqual([2]);
  });

  it('点已填的空可以换词；旧词释放出来', () => {
    const s = run(
      fresh(),
      { type: 'pick', value: 2 },
      { type: 'focus', index: 0 },
      { type: 'pick', value: 3 },
    );
    expect(s.answers[0]).toBe(3);
    expect(usedValues(s).has(2)).toBe(false);
    expect(run(s, { type: 'focus', index: 3 }, { type: 'pick', value: 2 }).answers[3]).toBe(2);
  });

  it('清空：clear 动作，或者再点一次当前空里的词', () => {
    const s = run(fresh(), { type: 'pick', value: 2 }, { type: 'focus', index: 0 });
    expect(run(s, { type: 'clear', index: 0 }).answers[0]).toBeNull();
    const toggled = run(s, { type: 'pick', value: 2 });
    expect(toggled.answers[0]).toBeNull();
    expect(toggled.focus).toBe(0);
    expect(run(fresh(), { type: 'clear', index: 4 })).toEqual(fresh());
  });

  it('不认识的词、越界的空都忽略', () => {
    const s = fresh();
    expect(run(s, { type: 'pick', value: 15 })).toBe(s);
    expect(run(s, { type: 'pick', value: 'A' })).toBe(s);
    expect(run(s, { type: 'answer', index: 10, value: 0 })).toBe(s);
    expect(run(s, { type: 'answer', index: -1, value: 0 })).toBe(s);
    expect(run(s, { type: 'focus', index: 1.5 })).toBe(s);
    expect(run(s, { type: 'clear', index: 99 })).toBe(s);
  });
});

describe('段落匹配和仔细阅读', () => {
  it('段落匹配：一个段落可以被多句选中，可以改选', () => {
    const s = run(
      createSheet(MATCHING),
      { type: 'answer', index: 0, value: 'B' },
      { type: 'answer', index: 1, value: 'B' },
      { type: 'answer', index: 1, value: 'K' },
    );
    expect(s.unique).toBe(false);
    expect(s.focus).toBeNull();
    expect(s.answers.slice(0, 2)).toEqual(['B', 'K']);
    expect(s.choices[0]).toHaveLength(11);
    expect(run(s, { type: 'pick', value: 'A' })).toBe(s);
    expect(run(s, { type: 'answer', index: 2, value: 'L' })).toBe(s);
  });

  it('仔细阅读：两道题（两篇）连起来 10 小题，每题只能选 A–D', () => {
    const s = createSheet(CAREFUL);
    expect(CAREFUL.parts).toHaveLength(2);
    expect(itemsOf(CAREFUL)).toHaveLength(10);
    expect(partOffsets(CAREFUL)).toEqual([0, 5]);
    expect(s.choices.every((c) => c.join('') === 'ABCD')).toBe(true);
    expect(run(s, { type: 'answer', index: 7, value: 'E' })).toBe(s);
    expect(run(s, { type: 'answer', index: 7, value: 'D' }).answers[7]).toBe('D');
  });

  it('按题拆出的作答数组和 PR-B 的 ObjectiveAnswerMap 同形', () => {
    const cloze = run(createSheet(CLOZE), { type: 'pick', value: 13 });
    const [clozeAnswers] = answersByPart(
      CLOZE as Extract<ReadingSet, { type: 'banked_cloze' }>,
      cloze,
    );
    expect(clozeAnswers).toEqual([13, null, null, null, null, null, null, null, null, null]);

    const careful = run(
      createSheet(CAREFUL),
      { type: 'answer', index: 0, value: 'B' },
      { type: 'answer', index: 6, value: 'C' },
    );
    expect(
      answersByPart(CAREFUL as Extract<ReadingSet, { type: 'careful_reading' }>, careful),
    ).toEqual([
      ['B', null, null, null, null],
      [null, 'C', null, null, null],
    ]);
  });
});

describe('判分、未答计数、提交和退出确认', () => {
  it('全对得满分', () => {
    const s = run(
      createSheet(MATCHING),
      ...DEMO_MATCHING.statements.map((st, index): SheetAction => ({
        type: 'answer',
        index,
        value: st.answer,
      })),
    );
    expect(gradeSheet(MATCHING, s)).toMatchObject({
      score: 10,
      maxScore: 10,
      wrongCount: 0,
      unanswered: 0,
    });
  });

  it('答错、没答都算错，逐题给出正确答案', () => {
    const first = DEMO_BANKED_CLOZE.blanks[0]!.answer;
    const wrong = DEMO_BANKED_CLOZE.options.findIndex(
      (_, i) => !DEMO_BANKED_CLOZE.blanks.some((b) => b.answer === i),
    );
    const s = run(
      createSheet(CLOZE),
      { type: 'pick', value: first },
      { type: 'pick', value: wrong },
    );
    const g = gradeSheet(CLOZE, s);
    expect(g).toMatchObject({ score: 1, maxScore: 10, wrongCount: 9, unanswered: 8 });
    expect(g.items[0]).toEqual({ index: 0, correct: true, expected: first, given: first });
    expect(g.items[1]).toMatchObject({ given: wrong, correct: false });
    expect(g.items[2]).toMatchObject({
      given: null,
      correct: false,
      expected: DEMO_BANKED_CLOZE.blanks[2]!.answer,
    });
  });

  it('提交前确认：有未答题时写明数量', () => {
    const s = run(createSheet(CAREFUL), { type: 'answer', index: 0, value: 'B' });
    expect(unansweredCount(s)).toBe(9);
    expect(submitPrompt(s).title).toBe('还有 9 题没答');
    const all = run(
      createSheet(CAREFUL),
      ...itemsOf(CAREFUL).map((_, index): SheetAction => ({ type: 'answer', index, value: 'A' })),
    );
    expect(unansweredCount(all)).toBe(0);
    expect(submitPrompt(all).title).toBe('提交答案？');
  });

  it('提交后锁定，reset 清空并解锁', () => {
    const s = run(createSheet(CLOZE), { type: 'pick', value: 0 }, { type: 'submit' });
    expect(s.submitted).toBe(true);
    expect(s.focus).toBeNull();
    for (const a of [
      { type: 'pick', value: 1 },
      { type: 'focus', index: 3 },
      { type: 'clear', index: 0 },
      { type: 'answer', index: 4, value: 2 },
    ] as SheetAction[])
      expect(run(s, a)).toBe(s);
    const again = run(s, { type: 'reset' });
    expect(again).toMatchObject({ submitted: false, focus: 0 });
    expect(unansweredCount(again)).toBe(10);
  });

  it('退出确认：答过题且没提交时才需要', () => {
    const s = createSheet(MATCHING);
    expect(needsExitConfirm(s)).toBe(false);
    const answered = run(s, { type: 'answer', index: 0, value: 'A' });
    expect(needsExitConfirm(answered)).toBe(true);
    expect(needsExitConfirm(run(answered, { type: 'submit' }))).toBe(false);
  });

  it('选项字母：候选词下标转 A–O，字母原样', () => {
    expect(valueLabel(0)).toBe('A');
    expect(valueLabel(14)).toBe('O');
    expect(valueLabel('K')).toBe('K');
  });
});

describe('六级卷面分折合（按大纲分值比例）', () => {
  it('官方占比：选词填空 5%、长篇阅读 10%、仔细阅读 20%，各 10 题', () => {
    expect(CET6_READING_WEIGHTS).toEqual({
      banked_cloze: { percent: 5, items: 10 },
      matching: { percent: 10, items: 10 },
      careful_reading: { percent: 20, items: 10 },
    });
  });

  it('每题分值 0.5 / 1 / 2，满分 5 / 10 / 20', () => {
    expect(cet6PaperScore('banked_cloze', 7, 10)).toEqual({
      points: 3.5,
      maxPoints: 5,
      percent: 5,
      perItem: 0.5,
    });
    expect(cet6PaperScore('matching', 3, 10)).toMatchObject({ points: 3, maxPoints: 10 });
    expect(cet6PaperScore('careful_reading', 9, 10)).toMatchObject({ points: 18, maxPoints: 20 });
  });

  it('题量不足时按实际题数折满分；越界输入夹到合理范围', () => {
    expect(cet6PaperScore('careful_reading', 4, 5)).toMatchObject({ points: 8, maxPoints: 10 });
    expect(cet6PaperScore('banked_cloze', 12, 10).points).toBe(5);
    expect(cet6PaperScore('banked_cloze', -1, 10).points).toBe(0);
    expect(cet6PaperScore('matching', 0, 0)).toMatchObject({ points: 0, maxPoints: 0 });
    expect(cet6PaperScore('banked_cloze', 3, 10).points).toBe(1.5);
  });
});

describe('选词填空正文切分', () => {
  it('切出文字段和空位段，序号从 0 开始', () => {
    expect(splitClozePassage('A {{1}} b {{2}}.')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'blank', index: 0 },
      { kind: 'text', text: ' b ' },
      { kind: 'blank', index: 1 },
      { kind: 'text', text: '.' },
    ]);
    expect(splitClozePassage('no blanks')).toEqual([{ kind: 'text', text: 'no blanks' }]);
  });
});

describe('和题库层对齐', () => {
  it('阅读题型 = types.ts 里 section 为 reading 的题型', () => {
    expect([...READING_QUESTION_TYPES]).toEqual(QUESTION_TYPES.filter(isReadingSectionType));
  });

  it('测试题（含压测版）都能通过 schemas.ts 校验', () => {
    for (const t of READING_QUESTION_TYPES)
      for (const set of [DEMO_READING[t], stressReadingSet(t)])
        for (const part of set.parts) {
          const r = parsePayload(set.type, part.payload);
          expect(r.success ? 'ok' : JSON.stringify(r.error.issues)).toBe('ok');
        }
  });

  it('gradeSheet 和按题调用 gradeObjective 的结果一致', () => {
    for (const t of READING_QUESTION_TYPES) {
      const set = DEMO_READING[t];
      let sheet = createSheet(set);
      itemsOf(set).forEach((it, i) => {
        const value =
          i % 2 === 0
            ? it.expected
            : i % 3 === 0
              ? it.choices.find((c) => c !== it.expected)
              : null;
        if (value !== null && value !== undefined)
          sheet = sheetReducer(sheet, { type: 'answer', index: i, value });
      });
      const mine = gradeSheet(set, sheet);
      const byPart = answersByPart(set as never, sheet) as never[];
      const theirs = set.parts.map((part, pi) =>
        gradeObjective({ type: set.type, payload: part.payload } as ObjectiveQuestion, byPart[pi]!),
      );
      expect([mine.score, mine.maxScore, mine.wrongCount]).toEqual([
        theirs.reduce((n, g) => n + g.score, 0),
        theirs.reduce((n, g) => n + g.maxScore, 0),
        theirs.reduce((n, g) => n + g.wrongCount, 0),
      ]);
    }
  });
});

describe('测试题自检', () => {
  it('三种题型都有示例练习，type 对得上', () => {
    for (const t of READING_QUESTION_TYPES) expect(DEMO_READING[t].type).toBe(t);
    expect(isReadingQuestionType('careful_reading')).toBe(true);
    expect(isReadingQuestionType('careful')).toBe(false);
  });

  it('选词填空：15 个不重复的词（字母序）、10 空按顺序出现、答案下标不重复', () => {
    const p = DEMO_BANKED_CLOZE;
    expect(p.options).toHaveLength(BANKED_CLOZE_OPTIONS);
    expect(new Set(p.options).size).toBe(BANKED_CLOZE_OPTIONS);
    expect([...p.options].sort()).toEqual(p.options);
    expect(p.blanks).toHaveLength(BANKED_CLOZE_BLANKS);
    const blanks = splitClozePassage(p.passage).flatMap((s) =>
      s.kind === 'blank' ? [s.index] : [],
    );
    expect(blanks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(new Set(p.blanks.map((b) => b.answer)).size).toBe(BANKED_CLOZE_BLANKS);
    expect(p.blanks.every((b) => b.answer >= 0 && b.answer < BANKED_CLOZE_OPTIONS)).toBe(true);
  });

  it('段落匹配：A–K 连续 11 段、10 句，答案都是存在的段落', () => {
    const labels = DEMO_MATCHING.paragraphs.map((p) => p.label);
    expect(labels.join('')).toBe('ABCDEFGHIJK');
    expect(DEMO_MATCHING.statements).toHaveLength(MATCHING_STATEMENTS);
    for (const s of DEMO_MATCHING.statements) expect(labels).toContain(s.answer);
  });

  it('仔细阅读：两篇各 5 题，每题 4 个不重复的选项', () => {
    expect(DEMO_CAREFUL).toHaveLength(2);
    for (const p of DEMO_CAREFUL) {
      expect(p.questions).toHaveLength(CAREFUL_READING_QUESTIONS);
      for (const q of p.questions) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
      }
    }
  });

  it('压测版保持题目结构和答案不变，候选词仍不重复', () => {
    for (const t of READING_QUESTION_TYPES) {
      const stress = stressReadingSet(t);
      expect(itemsOf(stress).map((i) => i.expected)).toEqual(
        itemsOf(DEMO_READING[t]).map((i) => i.expected),
      );
    }
    const cloze = stressReadingSet('banked_cloze');
    if (cloze.type !== 'banked_cloze') throw new Error('type');
    expect(new Set(cloze.parts[0]!.payload.options).size).toBe(15);
  });
});
