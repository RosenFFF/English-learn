/**
 * 学习进度导出/导入的文件格式与校验（纯函数）。
 * 只包含 user.db 里的学习数据和非敏感设置；API 密钥永远不导出。
 */
import type { CardRow, ReviewLogRow } from './fsrs';

export const BACKUP_FORMAT = 'english-learn-backup';
export const BACKUP_VERSION = 1;

export interface StudyPlanRow {
  book_id: string;
  daily_new: number;
  daily_review_cap: number;
  started_at: number;
  active: number;
}

export interface DailyStatRow {
  date: string;
  new_count: number;
  review_count: number;
  minutes: number;
  sessions: number;
  streak_freeze_used: number;
}

export interface KvRow {
  key: string;
  value: string;
}

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: number;
  schema_version: number;
  card: CardRow[];
  review_log: ReviewLogRow[];
  study_plan: StudyPlanRow[];
  daily_stat: DailyStatRow[];
  kv: KvRow[];
}

/** 允许随备份导出的设置项（白名单，防止将来误把敏感项写进 kv 后被导出） */
export const EXPORTABLE_KV_KEYS: ReadonlySet<string> = new Set([
  'llm_base_url',
  'llm_model',
  'auto_speak',
  'group_size',
]);

export class BackupError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);

function checkRows(name: string, v: unknown, check: (o: Record<string, unknown>) => boolean): void {
  if (!Array.isArray(v)) throw new BackupError(`备份文件缺少 ${name}`);
  v.forEach((row, i) => {
    if (!row || typeof row !== 'object' || !check(row as Record<string, unknown>)) {
      throw new BackupError(`备份文件的 ${name} 第 ${i + 1} 行格式不对`);
    }
  });
}

export function parseBackup(text: string): BackupPayload {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('不是有效的备份文件（JSON 解析失败）');
  }
  const o = data as Record<string, unknown> | null;
  if (!o || o.format !== BACKUP_FORMAT) throw new BackupError('不是 English Learn 的备份文件');
  if (!isNum(o.version) || o.version > BACKUP_VERSION)
    throw new BackupError('备份文件版本太新，请先升级 App');
  checkRows(
    'card',
    o.card,
    (r) =>
      [
        'word_id',
        'due',
        'stability',
        'difficulty',
        'elapsed_days',
        'scheduled_days',
        'reps',
        'lapses',
        'state',
      ].every((k) => isNum(r[k])) && isNumOrNull(r.last_review),
  );
  checkRows(
    'review_log',
    o.review_log,
    (r) =>
      isStr(r.id) && ['word_id', 'rating', 'state', 'due', 'reviewed_at'].every((k) => isNum(r[k])),
  );
  checkRows(
    'study_plan',
    o.study_plan,
    (r) => isStr(r.book_id) && isNum(r.daily_new) && isNum(r.daily_review_cap),
  );
  checkRows('daily_stat', o.daily_stat, (r) => isStr(r.date) && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  checkRows('kv', o.kv, (r) => isStr(r.key) && isStr(r.value));
  const p = o as unknown as BackupPayload;
  return {
    ...p,
    card: p.card.map((c) => ({
      ...c,
      learning_steps: isNum(c.learning_steps) ? c.learning_steps : 0,
      updated_at: isNum(c.updated_at) ? c.updated_at : p.exported_at,
      deleted: c.deleted === 1 ? 1 : 0,
    })),
    kv: p.kv.filter((r) => EXPORTABLE_KV_KEYS.has(r.key)),
  };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `english-learn-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
