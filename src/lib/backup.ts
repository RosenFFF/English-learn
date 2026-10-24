/**
 * 学习进度导出/导入的文件格式与校验（纯函数）。
 * 只包含 user.db 里的学习数据和非敏感设置；API 密钥永远不导出。
 */
import { isExamId, isSelectableExam } from './exams';
import {
  isPracticeSection,
  isQuestionType,
  QUESTION_SECTION,
  type AttemptRow,
  type QuestionRow,
} from './exam/types';
import type { CardRow, ReviewLogRow } from './fsrs';

export const BACKUP_FORMAT = 'english-learn-backup';
/**
 * 备份格式版本。
 * v1：学习进度和设置。
 * v2：增加题库 question 和作答记录 attempt；v1 文件仍能导入（题库视为空）。
 */
export const BACKUP_VERSION = 2;

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
  /** v2 起才有；parseBackup 读 v1 时补成空数组 */
  question?: QuestionRow[];
  attempt?: AttemptRow[];
}

/** 允许随备份导出的设置项（白名单，防止将来误把敏感项写进 kv 后被导出） */
export const EXPORTABLE_KV_KEYS: ReadonlySet<string> = new Set([
  'llm_base_url',
  'llm_model',
  'auto_speak',
  'group_size',
  'exam',
]);

/** 有固定取值范围的设置项：导入时值不合法就忽略这一项（保留设备上原来的值） */
const KV_VALUE_CHECKS: Readonly<Record<string, (value: string) => boolean>> = {
  exam: isSelectableExam,
};

/** 这一行设置能不能随备份导出 / 导入：键在白名单里，且值合法 */
export function isExportableKv(row: KvRow): boolean {
  if (!EXPORTABLE_KV_KEYS.has(row.key)) return false;
  const check = KV_VALUE_CHECKS[row.key];
  return check ? check(row.value) : true;
}

export class BackupError extends Error {}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNumOrNull = (v: unknown): boolean => v === null || isNum(v);
const isStrOrNull = (v: unknown): boolean => v === null || isStr(v);
const isFlag = (v: unknown): boolean => v === 0 || v === 1;
/** 字符串内容是一个 JSON 值（payload 必须是对象） */
function isJsonText(v: unknown, objectOnly = false): boolean {
  if (!isStr(v)) return false;
  try {
    const parsed: unknown = JSON.parse(v);
    return !objectOnly || (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
  } catch {
    return false;
  }
}
/** exam / section / type 取值合法，且题型和板块对得上 */
function isKnownKind(r: Record<string, unknown>): boolean {
  return (
    isExamId(r.exam) &&
    isPracticeSection(r.section) &&
    isQuestionType(r.type) &&
    QUESTION_SECTION[r.type] === r.section
  );
}

function isQuestionRow(r: Record<string, unknown>): boolean {
  return (
    isStr(r.id) &&
    isKnownKind(r) &&
    isNum(r.schema_version) &&
    isJsonText(r.payload, true) &&
    isStr(r.source) &&
    isStrOrNull(r.model ?? null) &&
    isNum(r.prompt_version) &&
    isNum(r.created_at) &&
    isFlag(r.deleted)
  );
}

function isAttemptRow(r: Record<string, unknown>): boolean {
  return (
    isStr(r.id) &&
    isStr(r.question_id) &&
    isKnownKind(r) &&
    isJsonText(r.answer) &&
    isNumOrNull(r.score ?? null) &&
    isNum(r.max_score) &&
    (r.feedback == null || isJsonText(r.feedback)) &&
    isNum(r.wrong_count) &&
    isFlag(r.needs_redo) &&
    isNumOrNull(r.duration_ms ?? null) &&
    isNum(r.started_at) &&
    isNum(r.submitted_at)
  );
}

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
  // v1 没有题库：当成空数组；v2 起这两张表必须有且行格式正确
  if (o.version >= 2) {
    checkRows('question', o.question, isQuestionRow);
    checkRows('attempt', o.attempt, isAttemptRow);
  }
  const question = o.version >= 2 ? (o.question as QuestionRow[]) : [];
  const attempt = o.version >= 2 ? (o.attempt as AttemptRow[]) : [];
  const ids = new Set(question.map((q) => q.id));
  attempt.forEach((a, i) => {
    if (!ids.has(a.question_id))
      throw new BackupError(`备份文件的 attempt 第 ${i + 1} 行对应的题目不存在`);
  });
  const p = o as unknown as BackupPayload;
  return {
    ...p,
    question: question.map((q) => ({ ...q, model: q.model ?? null })),
    attempt: attempt.map((a) => ({
      ...a,
      score: a.score ?? null,
      feedback: a.feedback ?? null,
      duration_ms: a.duration_ms ?? null,
    })),
    card: p.card.map((c) => ({
      ...c,
      learning_steps: isNum(c.learning_steps) ? c.learning_steps : 0,
      updated_at: isNum(c.updated_at) ? c.updated_at : p.exported_at,
      deleted: c.deleted === 1 ? 1 : 0,
    })),
    kv: p.kv.filter(isExportableKv),
  };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `english-learn-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

// ---------- 导入前自动备份（文件名与轮转，纯函数） ----------

/** 自动备份最多保留几份 */
export const AUTO_BACKUP_KEEP = 5;
const AUTO_BACKUP_NAME = /^auto-backup-\d{8}-\d{6}-(\d+)\.json$/;

/**
 * 自动备份文件名：`auto-backup-YYYYMMDD-HHmmss-<毫秒时间戳>.json`。
 * 前半段给人看（本地时间），末尾的毫秒时间戳用于排序，不受时区和改系统时间格式影响。
 */
export function autoBackupFileName(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `auto-backup-${date}-${time}-${now}.json`;
}

/** 从自动备份文件名里取出创建时间；不是自动备份文件返回 null */
export function autoBackupTime(name: string): number | null {
  const m = AUTO_BACKUP_NAME.exec(name);
  return m ? Number(m[1]) : null;
}

/** 只保留自动备份文件，按创建时间从新到旧排列（其它文件忽略） */
export function sortAutoBackups(names: readonly string[]): { name: string; createdAt: number }[] {
  return names
    .map((name) => ({ name, createdAt: autoBackupTime(name) }))
    .filter((b): b is { name: string; createdAt: number } => b.createdAt !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 轮转：返回需要删除的自动备份（保留最新的 keep 份；不认识的文件一律不删） */
export function autoBackupsToPrune(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[] {
  return sortAutoBackups(names)
    .slice(Math.max(0, keep))
    .map((b) => b.name);
}
