/**
 * @jest-environment node
 *
 * 题库与作答记录仓储：迁移 v2、题目增查删、作答写入、错题本、待重练、按板块统计。
 */
import { BACKUP_VERSION, parseBackup } from '../lib/backup';
import type { AttemptRow, QuestionRow } from '../lib/exam/types';
import { openMemoryDb } from './__testutils__/nodeDb';
import { runMigrations } from './migrate';
import { MIGRATIONS } from './migrations';
import * as qrepo from './questionRepo';
import type { SqlDb } from './types';
import * as repo from './userRepo';

const T0 = new Date(2026, 9, 23, 9).getTime();
let db: SqlDb;

function question(id: string, over: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    exam: 'cet6',
    section: 'reading',
    type: 'careful_reading',
    schema_version: 1,
    payload: '{"passage":"x"}',
    source: 'llm',
    model: 'deepseek-chat',
    prompt_version: 1,
    created_at: T0,
    deleted: 0,
    ...over,
  };
}

function attempt(id: string, questionId: string, over: Partial<AttemptRow> = {}): AttemptRow {
  return {
    id,
    question_id: questionId,
    exam: 'cet6',
    section: 'reading',
    type: 'careful_reading',
    answer: '["A","B","C","D","A"]',
    score: 3,
    max_score: 5,
    feedback: null,
    wrong_count: 2,
    needs_redo: 0,
    duration_ms: 60_000,
    started_at: T0,
    submitted_at: T0 + 60_000,
    ...over,
  };
}

beforeEach(async () => {
  db = openMemoryDb();
  await runMigrations(db, MIGRATIONS, T0);
});

describe('迁移 v2', () => {
  it('从 v1 升级：原有进度不动，新增 question / attempt 两张表和索引', async () => {
    const old = openMemoryDb();
    await runMigrations(
      old,
      MIGRATIONS.filter((m) => m.version === 1),
      T0,
    );
    await repo.kvSet(old, 'exam', 'cet6');
    await repo.recordSessionDone(old, '2026-10-22', 3);

    expect(await runMigrations(old, MIGRATIONS, T0)).toBe(2);
    expect(await repo.kvGet(old, 'exam')).toBe('cet6');
    expect((await repo.getDayStat(old, '2026-10-22'))?.sessions).toBe(1);
    const names = await old.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name IN ('question','attempt','idx_question_pick','idx_attempt_q','idx_attempt_stat','idx_attempt_wrong') ORDER BY name",
      [],
    );
    expect(names.map((n) => n.name)).toEqual([
      'attempt',
      'idx_attempt_q',
      'idx_attempt_stat',
      'idx_attempt_wrong',
      'idx_question_pick',
      'question',
    ]);
  });

  it('新字段默认值：deleted、wrong_count、needs_redo 默认 0', async () => {
    await db.runAsync(
      'INSERT INTO question(id, exam, section, type, schema_version, payload, source, prompt_version, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ['q', 'cet6', 'writing', 'essay', 1, '{}', 'llm', 1, T0],
    );
    await db.runAsync(
      'INSERT INTO attempt(id, question_id, exam, section, type, answer, max_score, started_at, submitted_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ['a', 'q', 'cet6', 'writing', 'essay', '"text"', 15, T0, T0],
    );
    expect(await qrepo.getQuestion(db, 'q')).toMatchObject({ deleted: 0, model: null });
    const [a] = await qrepo.listAttemptsForQuestion(db, 'q');
    expect(a).toMatchObject({ wrong_count: 0, needs_redo: 0, score: null, feedback: null });
  });
});

describe('题目', () => {
  it('插入、取单题，字段原样往返', async () => {
    const q = question('q1', { model: null });
    await qrepo.insertQuestion(db, q);
    expect(await qrepo.getQuestion(db, 'q1')).toEqual(q);
    expect(await qrepo.getQuestion(db, 'nope')).toBeNull();
  });

  it('按 exam + type 列出未删除的题，最新的在前；软删除后不再列出，但还能按 id 取到', async () => {
    await qrepo.insertQuestion(db, question('old', { created_at: T0 }));
    await qrepo.insertQuestion(db, question('new', { created_at: T0 + 1000 }));
    await qrepo.insertQuestion(db, question('other-type', { type: 'matching' }));
    await qrepo.insertQuestion(db, question('other-exam', { exam: 'ielts' }));

    expect((await qrepo.listQuestions(db, 'cet6', 'careful_reading')).map((q) => q.id)).toEqual([
      'new',
      'old',
    ]);
    expect((await qrepo.listQuestions(db, 'cet6', 'careful_reading', 1)).map((q) => q.id)).toEqual([
      'new',
    ]);

    await qrepo.softDeleteQuestion(db, 'new');
    expect((await qrepo.listQuestions(db, 'cet6', 'careful_reading')).map((q) => q.id)).toEqual([
      'old',
    ]);
    expect(await qrepo.getQuestion(db, 'new')).toMatchObject({ id: 'new', deleted: 1 });
  });

  it('id 重复时报错，不会悄悄覆盖原题', async () => {
    await qrepo.insertQuestion(db, question('q1'));
    await expect(qrepo.insertQuestion(db, question('q1', { payload: '{}' }))).rejects.toThrow();
    expect((await qrepo.getQuestion(db, 'q1'))?.payload).toBe('{"passage":"x"}');
  });
});

describe('作答记录', () => {
  beforeEach(async () => {
    await qrepo.insertQuestion(db, question('read'));
    await qrepo.insertQuestion(
      db,
      question('essay', { section: 'writing', type: 'essay', payload: '{}' }),
    );
    await qrepo.insertQuestion(
      db,
      question('trans', { section: 'translation', type: 'translation', payload: '{}' }),
    );
  });

  it('写入后按题列出，最新的在前，字段原样往返', async () => {
    const first = attempt('a1', 'read', { submitted_at: T0 + 1 });
    const second = attempt('a2', 'read', { submitted_at: T0 + 2, wrong_count: 0, score: 5 });
    await qrepo.insertAttempt(db, first);
    await qrepo.insertAttempt(db, second);
    expect(await qrepo.listAttemptsForQuestion(db, 'read')).toEqual([second, first]);
    expect(await qrepo.listAttemptsForQuestion(db, 'essay')).toEqual([]);
  });

  it('错题本只列 wrong_count > 0 的作答（主观题 wrong_count 为 0，不进错题本），按考试过滤', async () => {
    await qrepo.insertAttempt(db, attempt('wrong', 'read', { wrong_count: 2 }));
    await qrepo.insertAttempt(db, attempt('right', 'read', { wrong_count: 0, score: 5 }));
    await qrepo.insertAttempt(
      db,
      attempt('low-essay', 'essay', {
        section: 'writing',
        type: 'essay',
        score: 6,
        max_score: 15,
        wrong_count: 0,
        needs_redo: 1,
      }),
    );
    await qrepo.insertAttempt(db, attempt('ielts', 'read', { exam: 'ielts', wrong_count: 3 }));

    expect((await qrepo.listWrongAttempts(db, 'cet6')).map((a) => a.id)).toEqual(['wrong']);
    expect((await qrepo.listWrongAttempts(db, 'ielts')).map((a) => a.id)).toEqual(['ielts']);
  });

  it('待重练只列 needs_redo = 1 的作答，最新的在前', async () => {
    const subj = { score: 6, max_score: 15, wrong_count: 0 } as const;
    await qrepo.insertAttempt(
      db,
      attempt('e1', 'essay', { ...subj, section: 'writing', type: 'essay', needs_redo: 1 }),
    );
    await qrepo.insertAttempt(
      db,
      attempt('t1', 'trans', {
        ...subj,
        section: 'translation',
        type: 'translation',
        needs_redo: 1,
        submitted_at: T0 + 999_999,
      }),
    );
    await qrepo.insertAttempt(
      db,
      attempt('e2', 'essay', { ...subj, section: 'writing', type: 'essay', score: 12 }),
    );
    expect((await qrepo.listRedoAttempts(db, 'cet6')).map((a) => a.id)).toEqual(['t1', 'e1']);
  });

  it('按板块统计：作答次数、得分合计（评分失败的不计入满分）、错题数、待重练数、最近时间', async () => {
    await qrepo.insertAttempt(db, attempt('r1', 'read', { score: 3, wrong_count: 2 }));
    await qrepo.insertAttempt(
      db,
      attempt('r2', 'read', { score: 5, wrong_count: 0, submitted_at: T0 + 120_000 }),
    );
    await qrepo.insertAttempt(
      db,
      attempt('w1', 'essay', {
        section: 'writing',
        type: 'essay',
        score: 7.5,
        max_score: 15,
        wrong_count: 0,
        needs_redo: 1,
      }),
    );
    await qrepo.insertAttempt(
      db,
      attempt('w2', 'essay', {
        section: 'writing',
        type: 'essay',
        score: null,
        max_score: 15,
        wrong_count: 0,
      }),
    );
    await qrepo.insertAttempt(db, attempt('old', 'read', { submitted_at: T0 - 1 }));

    expect(await qrepo.statsBySection(db, 'cet6', T0)).toEqual([
      {
        section: 'reading',
        attempts: 2,
        score_sum: 8,
        max_score_sum: 10,
        wrong_sum: 2,
        redo_count: 0,
        last_submitted_at: T0 + 120_000,
      },
      {
        section: 'writing',
        attempts: 2,
        score_sum: 7.5,
        max_score_sum: 15,
        wrong_sum: 0,
        redo_count: 1,
        last_submitted_at: T0 + 60_000,
      },
    ]);
    expect((await qrepo.statsBySection(db, 'cet6'))[0].attempts).toBe(3);
    expect(await qrepo.statsBySection(db, 'ielts')).toEqual([]);
  });
});

describe('备份 v2：题库随备份导出、导入', () => {
  async function seed(target: SqlDb): Promise<void> {
    await qrepo.insertQuestion(target, question('q1'));
    await qrepo.insertQuestion(
      target,
      question('q2', { section: 'writing', type: 'essay', model: null, deleted: 1 }),
    );
    await qrepo.insertAttempt(target, attempt('a1', 'q1'));
    await qrepo.insertAttempt(
      target,
      attempt('a2', 'q2', {
        section: 'writing',
        type: 'essay',
        answer: '"My essay"',
        score: null,
        max_score: 15,
        feedback: null,
        wrong_count: 0,
        duration_ms: null,
      }),
    );
  }
  const dumpTables = async (target: SqlDb) => ({
    question: await target.getAllAsync('SELECT * FROM question ORDER BY id', []),
    attempt: await target.getAllAsync('SELECT * FROM attempt ORDER BY id', []),
  });

  it('导出带两张表，版本跟随 BACKUP_VERSION；往返后完全一致', async () => {
    await seed(db);
    const dump = await repo.dumpForBackup(db, 2, T0);
    expect(dump.version).toBe(BACKUP_VERSION);
    expect(dump.question).toHaveLength(2);
    expect(dump.attempt).toHaveLength(2);

    const other = openMemoryDb();
    await runMigrations(other, MIGRATIONS, T0);
    await qrepo.insertQuestion(other, question('stale'));
    await qrepo.insertAttempt(other, attempt('stale-a', 'stale'));
    await repo.restoreFromBackup(other, parseBackup(JSON.stringify(dump)));
    expect(await dumpTables(other)).toEqual(await dumpTables(db));
  });

  it('导入 v1 备份：学习进度照常恢复，题库被清空', async () => {
    await seed(db);
    const v1 = {
      format: 'english-learn-backup',
      version: 1,
      exported_at: T0,
      schema_version: 1,
      card: [],
      review_log: [],
      study_plan: [
        { book_id: 'cet6', daily_new: 20, daily_review_cap: 200, started_at: T0, active: 1 },
      ],
      daily_stat: [],
      kv: [],
    };
    await repo.restoreFromBackup(db, parseBackup(JSON.stringify(v1)));
    expect(await dumpTables(db)).toEqual({ question: [], attempt: [] });
    expect(await repo.getActivePlan(db)).toMatchObject({ book_id: 'cet6' });
  });

  it('导入中途失败整体回滚，题库保持原样', async () => {
    await seed(db);
    const before = await dumpTables(db);
    const dump = await repo.dumpForBackup(db, 2, T0);
    // 绕过 parseBackup：两道题 id 相同，第二次插入违反主键
    const broken = { ...dump, question: [dump.question![0], dump.question![0]] };
    await expect(repo.restoreFromBackup(db, broken)).rejects.toThrow();
    expect(await dumpTables(db)).toEqual(before);
  });
});
