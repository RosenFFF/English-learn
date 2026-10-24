/**
 * 错题本：行 → 条目（摘要、详情、能否重做）、按板块分组、重做后移不移出。
 */
import { SECTION_IDS } from '../exams';
import { LEGACY_LISTENING_PAYLOADS, VALID_PAYLOADS } from './__testutils__/fixtures';
import { DEMO_BANKED_CLOZE, DEMO_CAREFUL, DEMO_MATCHING } from './__testutils__/reading-fixtures';
import { DEMO_ESSAY, DEMO_TRANSLATION } from './__testutils__/subjective-fixtures';
import {
  clip,
  countMistakes,
  groupMistakes,
  mistakePreview,
  redoOutcomeText,
  redoTarget,
  stillMistake,
  toMistakeItem,
  type OpenMistakeRow,
} from './mistakes';
import { QUESTION_SECTION, type QuestionType } from './types';

const T0 = new Date(2026, 9, 23, 9).getTime();

function row(type: QuestionType, over: Partial<OpenMistakeRow> = {}): OpenMistakeRow {
  const subjective = type === 'translation' || type === 'essay';
  const payload =
    type === 'banked_cloze'
      ? DEMO_BANKED_CLOZE
      : type === 'matching'
        ? DEMO_MATCHING
        : type === 'careful_reading'
          ? DEMO_CAREFUL[0]
          : type === 'translation'
            ? DEMO_TRANSLATION
            : type === 'essay'
              ? DEMO_ESSAY
              : VALID_PAYLOADS[type];
  return {
    question_id: `q-${type}`,
    exam: 'cet6',
    section: QUESTION_SECTION[type],
    type,
    score: subjective ? 6 : 3,
    max_score: subjective ? 15 : 5,
    wrong_count: subjective ? 0 : 2,
    needs_redo: subjective ? 1 : 0,
    submitted_at: T0,
    miss_times: 1,
    schema_version: 2,
    payload: JSON.stringify(payload),
    ...over,
  };
}

describe('clip / mistakePreview', () => {
  it('压成一行，超长截断加 …（按字符算，不切坏中文和 emoji）', () => {
    expect(clip('  a\n\nb   c ')).toBe('a b c');
    expect(clip('一二三四五', 3)).toBe('一二三…');
    expect(clip('😀😀😀😀', 2)).toBe('😀😀…');
    expect(clip('短', 3)).toBe('短');
  });

  it('选词填空的空位换成 ____；段落匹配、写作取标题；翻译取原文开头', () => {
    expect(mistakePreview('banked_cloze', { passage: 'Cities {{1}} roofs into {{2}}.' })).toBe(
      'Cities ____ roofs into ____.',
    );
    expect(mistakePreview('matching', DEMO_MATCHING)).toBe(DEMO_MATCHING.title);
    expect(mistakePreview('essay', DEMO_ESSAY)).toBe(DEMO_ESSAY.title);
    expect(mistakePreview('translation', DEMO_TRANSLATION)).toMatch(/^近二十年来，中国建成了/);
    expect([...mistakePreview('translation', DEMO_TRANSLATION)]).toHaveLength(81);
  });

  it('听力取话题，没有话题取第一句（兼容旧 transcript 和新 script 两种结构）；缺字段不报错', () => {
    expect(mistakePreview('lecture', { topic: 'sleep science' })).toBe('sleep science');
    expect(
      mistakePreview('passage', { transcript: [{ speaker: 'W', text: 'Hello there.' }] }),
    ).toBe('Hello there.');
    expect(mistakePreview('lecture', { script: [{ speaker: 'm', text: 'Good morning.' }] })).toBe(
      'Good morning.',
    );
    expect(mistakePreview('long_conversation', {})).toBe('');
    expect(mistakePreview('careful_reading', null)).toBe('');
  });
});

describe('toMistakeItem', () => {
  it('客观题：显示上次错几题、共几题，能点进阅读作答页重做', () => {
    const item = toMistakeItem(row('careful_reading', { miss_times: 3 }));
    expect(item).toMatchObject({
      questionId: 'q-careful_reading',
      kind: 'objective',
      typeLabel: '仔细阅读',
      badge: '错 2 题',
      detail: '上次错 2 题 · 共 5 题',
      missTimes: 3,
      dateLabel: '10月23日',
      redo: { screen: 'reading', type: 'careful_reading' },
      blocked: null,
    });
    expect(item.preview).toMatch(/^Most of us treat boredom/);
  });

  it('主观题：显示上次得分，翻译、写作各回自己的作答页', () => {
    expect(toMistakeItem(row('translation', { score: 7.5 }))).toMatchObject({
      kind: 'subjective',
      badge: '待重练',
      detail: '上次 7.5 / 15 分',
      redo: { screen: 'translation' },
    });
    expect(toMistakeItem(row('essay'))).toMatchObject({
      detail: '上次 6 / 15 分',
      redo: { screen: 'writing' },
    });
    expect(toMistakeItem(row('essay', { score: null })).detail).toBe('上次没评上分');
  });

  it('题目读不出来（版本太新 / 不是 JSON / 格式不对）：照样列出，给中文原因，不能重做', () => {
    const newer = toMistakeItem(row('matching', { schema_version: 99 }));
    expect(newer.redo).toBeNull();
    expect(newer.blocked).toBe('这道题读不出来，没法重做：这道题来自更新版本的 App，请先升级');
    expect(newer.preview).toBe('');

    const broken = toMistakeItem(row('essay', { payload: '{oops' }));
    expect(broken.blocked).toBe('这道题读不出来，没法重做：题目内容不是有效的 JSON');

    const bad = toMistakeItem(row('banked_cloze', { payload: '{"passage":"x"}' }));
    expect(bad.redo).toBeNull();
    expect(bad.blocked).toMatch(/^这道题读不出来，没法重做：题目内容格式不对：$/);
    expect(bad.blocked).not.toContain('\n');
  });

  it('v1 老题（没有 topic）照常能重做', () => {
    const { topic: _t, ...v1 } = DEMO_MATCHING;
    const item = toMistakeItem(row('matching', { schema_version: 1, payload: JSON.stringify(v1) }));
    expect(item.blocked).toBeNull();
    expect(item.redo).toEqual({ screen: 'reading', type: 'matching' });
  });

  it('听力题（含 v1 旧结构）能点进听力作答页重做', () => {
    const item = toMistakeItem(row('passage', { schema_version: 3 }));
    expect(item.kind).toBe('objective');
    expect(item.blocked).toBeNull();
    expect(item.redo).toEqual({ screen: 'listening', type: 'passage' });
    // v1 旧结构（transcript）读出来转成 v3，也能重做
    const legacy = toMistakeItem(
      row('lecture', {
        schema_version: 1,
        payload: JSON.stringify(LEGACY_LISTENING_PAYLOADS.lecture),
      }),
    );
    expect(legacy.blocked).toBeNull();
    expect(legacy.redo).toEqual({ screen: 'listening', type: 'lecture' });
    // v3 的题按 v1 存（结构对不上）：列出来但读不出来
    expect(toMistakeItem(row('passage', { schema_version: 1 })).redo).toBeNull();
    for (const t of ['long_conversation', 'lecture'] as const)
      expect(redoTarget(t)).toEqual({ screen: 'listening', type: t });
  });

  it('累计次数至少按 1 次算', () => {
    expect(toMistakeItem(row('matching', { miss_times: 0 })).missTimes).toBe(1);
  });
});

describe('groupMistakes', () => {
  it('按首页板块顺序分组，组内保持查询顺序；没有错题的板块不出现', () => {
    const rows = [
      row('essay', { question_id: 'e1', submitted_at: T0 + 5 }),
      row('careful_reading', { question_id: 'c1', submitted_at: T0 + 4 }),
      row('translation', { question_id: 't1', submitted_at: T0 + 3 }),
      row('matching', { question_id: 'm1', submitted_at: T0 + 2 }),
    ];
    const groups = groupMistakes(rows, SECTION_IDS);
    expect(groups.map((g) => [g.section, g.title, g.items.map((i) => i.questionId)])).toEqual([
      ['reading', '阅读', ['c1', 'm1']],
      ['translation', '翻译', ['t1']],
      ['writing', '写作', ['e1']],
    ]);
    expect(countMistakes(groups)).toBe(4);
  });

  it('空列表 → 空分组；不在顺序表里的板块排到最后', () => {
    expect(groupMistakes([], SECTION_IDS)).toEqual([]);
    const groups = groupMistakes(
      [row('essay', { question_id: 'e' }), row('matching', { question_id: 'm' })],
      ['writing'],
    );
    expect(groups.map((g) => g.section)).toEqual(['writing', 'reading']);
  });
});

describe('重做后移不移出', () => {
  it('客观题全对才移出；主观题 ≥ 9 分移出（和 listOpenMistakes 一致）', () => {
    expect(stillMistake({ kind: 'objective', wrongCount: 0 })).toBe(false);
    expect(stillMistake({ kind: 'objective', wrongCount: 1 })).toBe(true);
    expect(stillMistake({ kind: 'subjective', score: 9 })).toBe(false);
    expect(stillMistake({ kind: 'subjective', score: 8.5 })).toBe(true);
  });

  it('交卷后的提示语', () => {
    expect(redoOutcomeText({ kind: 'objective', wrongCount: 0 })).toBe('重做通过，已从错题本移出');
    expect(redoOutcomeText({ kind: 'objective', wrongCount: 2 })).toBe('还错 2 题，先留在错题本里');
    expect(redoOutcomeText({ kind: 'subjective', score: 12 })).toBe('重做通过，已从错题本移出');
    expect(redoOutcomeText({ kind: 'subjective', score: 6 })).toBe('还没到 9 分，先留在错题本里');
  });
});
