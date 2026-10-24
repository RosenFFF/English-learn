import {
  EXAMS,
  examSections,
  getExam,
  getSection,
  isExamId,
  isSectionId,
  isSelectableExam,
  SECTION_IDS,
} from './exams';

describe('考试与板块元数据', () => {
  it('考试 id 固定为 cet6 / kaoyan / ielts；这一期只有六级可选', () => {
    expect(EXAMS.map((e) => e.id)).toEqual(['cet6', 'kaoyan', 'ielts']);
    expect(EXAMS.filter((e) => e.status === 'available').map((e) => e.id)).toEqual(['cet6']);
    expect(getExam('cet6')).toMatchObject({ name: '大学英语六级', shortName: '六级' });
  });

  it('isExamId / isSelectableExam：只认白名单，即将推出的考试不能选', () => {
    expect(isExamId('cet6')).toBe(true);
    expect(isExamId('ielts')).toBe(true);
    for (const v of ['cet4', 'CET6', '', ' cet6', null, undefined, 6, {}]) {
      expect(isExamId(v)).toBe(false);
      expect(isSelectableExam(v)).toBe(false);
    }
    expect(isSelectableExam('cet6')).toBe(true);
    expect(isSelectableExam('kaoyan')).toBe(false);
    expect(isSelectableExam('ielts')).toBe(false);
  });

  it('板块白名单：六个 id，只有词汇已上线', () => {
    expect(SECTION_IDS).toEqual([
      'vocab',
      'reading',
      'translation',
      'writing',
      'listening',
      'mistakes',
    ]);
    for (const id of SECTION_IDS) {
      expect(isSectionId(id)).toBe(true);
      expect(getSection(id).title).not.toBe('');
      expect(getSection(id).description).not.toBe('');
    }
    expect(SECTION_IDS.filter((id) => getSection(id).available)).toEqual(['vocab']);
    for (const v of ['', 'Vocab', 'today', '../vocab', 'constructor', 'toString', null, 1]) {
      expect(isSectionId(v)).toBe(false);
    }
  });

  it('六级首页按顺序列出 6 个板块', () => {
    expect(examSections('cet6').map((s) => s.title)).toEqual([
      '词汇',
      '阅读',
      '翻译',
      '写作',
      '听力',
      '错题本',
    ]);
  });
});
