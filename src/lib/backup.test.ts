import {
  AUTO_BACKUP_KEEP,
  BACKUP_VERSION,
  autoBackupFileName,
  autoBackupsToPrune,
  autoBackupTime,
  backupFileName,
  BackupError,
  EXPORTABLE_KV_KEYS,
  isExportableKv,
  parseBackup,
  sortAutoBackups,
} from './backup';

const valid = {
  format: 'english-learn-backup',
  version: 1,
  exported_at: 1000,
  schema_version: 1,
  card: [
    {
      word_id: 1,
      due: 1,
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 1,
      lapses: 0,
      state: 2,
      last_review: 1,
    },
  ],
  review_log: [
    {
      id: 'a',
      word_id: 1,
      rating: 3,
      state: 0,
      due: 1,
      reviewed_at: 1,
      elapsed_days: 0,
      scheduled_days: 1,
    },
  ],
  study_plan: [{ book_id: 'cet4', daily_new: 20, daily_review_cap: 200, started_at: 1, active: 1 }],
  daily_stat: [
    {
      date: '2026-10-17',
      new_count: 1,
      review_count: 0,
      minutes: 2,
      sessions: 1,
      streak_freeze_used: 0,
    },
  ],
  kv: [
    { key: 'llm_model', value: 'm' },
    { key: 'llm_api_key', value: 'sk-leak' },
  ],
};

describe('备份文件校验', () => {
  it('合法文件：补齐旧版本缺的字段，并过滤掉非白名单设置（绝不导入密钥）', () => {
    const p = parseBackup(JSON.stringify(valid));
    expect(p.card[0]).toMatchObject({ learning_steps: 0, updated_at: 1000, deleted: 0 });
    expect(p.kv).toEqual([{ key: 'llm_model', value: 'm' }]);
  });

  it('当前考试 exam 随备份导入；值不合法（不认识或还没上线）就忽略这一项', () => {
    expect(EXPORTABLE_KV_KEYS.has('exam')).toBe(true);
    const withExam = (value: string) =>
      parseBackup(JSON.stringify({ ...valid, kv: [...valid.kv, { key: 'exam', value }] })).kv;
    expect(withExam('cet6')).toEqual([
      { key: 'llm_model', value: 'm' },
      { key: 'exam', value: 'cet6' },
    ]);
    for (const bad of ['ielts', 'kaoyan', 'cet4', '', 'CET6', '<script>'])
      expect(withExam(bad)).toEqual([{ key: 'llm_model', value: 'm' }]);
  });

  it('isExportableKv：键在白名单且值合法', () => {
    expect(isExportableKv({ key: 'exam', value: 'cet6' })).toBe(true);
    expect(isExportableKv({ key: 'exam', value: 'x' })).toBe(false);
    expect(isExportableKv({ key: 'auto_speak', value: '0' })).toBe(true);
    expect(isExportableKv({ key: 'llm_api_key', value: 'sk' })).toBe(false);
  });

  it.each([
    ['不是 JSON', 'oops'],
    ['不是本 App 的文件', JSON.stringify({ format: 'x' })],
    ['版本太新', JSON.stringify({ ...valid, version: 99 })],
    ['缺表', JSON.stringify({ ...valid, card: undefined })],
    ['行格式不对', JSON.stringify({ ...valid, card: [{ word_id: 'x' }] })],
    ['日期格式不对', JSON.stringify({ ...valid, daily_stat: [{ date: '17/10/2026' }] })],
  ])('拒绝：%s', (_name, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });

  it('文件名带本地时间', () => {
    expect(backupFileName(new Date(2026, 9, 17, 9, 5).getTime())).toBe(
      'english-learn-backup-20261017-0905.json',
    );
  });
});

describe('备份 v2：题库和作答记录', () => {
  const question = {
    id: 'q1',
    exam: 'cet6',
    section: 'reading',
    type: 'careful_reading',
    schema_version: 1,
    payload: '{"passage":"x"}',
    source: 'llm',
    model: 'm',
    prompt_version: 1,
    created_at: 1,
    deleted: 0,
  };
  const attempt = {
    id: 'a1',
    question_id: 'q1',
    exam: 'cet6',
    section: 'reading',
    type: 'careful_reading',
    answer: '["A",null]',
    score: 1,
    max_score: 5,
    feedback: null,
    wrong_count: 4,
    needs_redo: 0,
    duration_ms: 1000,
    started_at: 1,
    submitted_at: 2,
  };
  const v2 = { ...valid, version: 2, question: [question], attempt: [attempt] };

  it('当前版本是 2', () => {
    expect(BACKUP_VERSION).toBe(2);
  });

  it('v1 文件没有题库字段，读出来是空数组', () => {
    const p = parseBackup(JSON.stringify(valid));
    expect(p.question).toEqual([]);
    expect(p.attempt).toEqual([]);
  });

  it('v1 文件里即使混进了题库字段也忽略（v1 不认识它们）', () => {
    const p = parseBackup(JSON.stringify({ ...valid, question: [{ bad: 1 }] }));
    expect(p.question).toEqual([]);
  });

  it('v2 合法文件原样读出；缺省的可空字段补成 null', () => {
    const p = parseBackup(JSON.stringify(v2));
    expect(p.question).toEqual([question]);
    expect(p.attempt).toEqual([attempt]);
    const { model: _m, ...noModel } = question;
    const { score: _s, feedback: _f, duration_ms: _d, ...sparse } = attempt;
    const q = parseBackup(JSON.stringify({ ...v2, question: [noModel], attempt: [sparse] }));
    expect(q.question![0].model).toBeNull();
    expect(q.attempt![0]).toMatchObject({ score: null, feedback: null, duration_ms: null });
  });

  it('版本 3 报「版本太新」', () => {
    expect(() => parseBackup(JSON.stringify({ ...v2, version: 3 }))).toThrow(/版本太新/);
  });

  it.each([
    ['v2 缺 question', { ...v2, question: undefined }, /缺少 question/],
    ['v2 缺 attempt', { ...v2, attempt: undefined }, /缺少 attempt/],
    ['题目 id 不是字符串', { ...v2, question: [{ ...question, id: 1 }] }, /question 第 1 行/],
    ['不认识的题型', { ...v2, question: [{ ...question, type: 'cloze' }] }, /question 第 1 行/],
    [
      '题型和板块对不上',
      { ...v2, question: [{ ...question, section: 'writing' }] },
      /question 第 1 行/,
    ],
    ['不认识的考试', { ...v2, question: [{ ...question, exam: 'cet4' }] }, /question 第 1 行/],
    [
      'payload 不是 JSON 对象',
      { ...v2, question: [{ ...question, payload: '[1]' }] },
      /question 第 1 行/,
    ],
    ['deleted 不是 0/1', { ...v2, question: [{ ...question, deleted: 2 }] }, /question 第 1 行/],
    ['作答不是 JSON', { ...v2, attempt: [{ ...attempt, answer: 'A,B' }] }, /attempt 第 1 行/],
    ['得分不是数字', { ...v2, attempt: [{ ...attempt, score: '1' }] }, /attempt 第 1 行/],
    [
      'needs_redo 不合法',
      { ...v2, attempt: [{ ...attempt, needs_redo: true }] },
      /attempt 第 1 行/,
    ],
    [
      '作答对应的题目不存在',
      { ...v2, attempt: [{ ...attempt, question_id: 'nope' }] },
      /对应的题目不存在/,
    ],
  ])('拒绝坏行：%s', (_name, data, msg) => {
    expect(() => parseBackup(JSON.stringify(data))).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify(data))).toThrow(msg);
  });
});

describe('自动备份文件名与轮转', () => {
  const t = (min: number) => new Date(2026, 9, 17, 9, min, 7).getTime();

  it('文件名带本地时间和毫秒时间戳，能解析回创建时间', () => {
    const name = autoBackupFileName(t(5));
    expect(name).toBe(`auto-backup-20261017-090507-${t(5)}.json`);
    expect(autoBackupTime(name)).toBe(t(5));
    expect(autoBackupTime('english-learn-backup-20261017-0905.json')).toBeNull();
    expect(autoBackupTime('auto-backup-x.json')).toBeNull();
  });

  it('按创建时间从新到旧排序，忽略其它文件', () => {
    const names = [t(1), t(3), t(2)].map(autoBackupFileName);
    expect(sortAutoBackups([...names, 'readme.txt']).map((b) => b.createdAt)).toEqual([
      t(3),
      t(2),
      t(1),
    ]);
  });

  it(`只保留最新 ${AUTO_BACKUP_KEEP} 份，不删除不认识的文件`, () => {
    const names = [0, 1, 2, 3, 4, 5, 6].map((m) => autoBackupFileName(t(m)));
    expect(autoBackupsToPrune([...names, 'other.json'])).toEqual([names[1], names[0]]);
    expect(autoBackupsToPrune(names.slice(0, 3))).toEqual([]);
  });
});
