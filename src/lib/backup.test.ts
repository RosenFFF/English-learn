import { backupFileName, BackupError, parseBackup } from './backup';

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
