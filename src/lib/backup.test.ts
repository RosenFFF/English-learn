import {
  AUTO_BACKUP_KEEP,
  autoBackupFileName,
  autoBackupsToPrune,
  autoBackupTime,
  backupFileName,
  BackupError,
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
