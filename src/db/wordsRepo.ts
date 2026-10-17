/** words.db 仓储（只读）。 */
import { formatPhonetic, parseMeanings, parsePairs, type WordDetail } from '../lib/words';
import type { SqlDb } from './types';

export type ExamId = 'cet4' | 'cet6' | 'kaoyan' | 'ielts';

export interface BookRow {
  id: string;
  name: string;
  exam: ExamId;
  word_count: number;
}

interface WordRow {
  id: number;
  headword: string;
  phonetic_uk: string | null;
  phonetic_us: string | null;
  meanings_json: string;
  examples_json: string;
  phrases_json: string | null;
}

const toDetail = (r: WordRow): WordDetail => ({
  id: r.id,
  headword: r.headword,
  phoneticUk: formatPhonetic(r.phonetic_uk),
  phoneticUs: formatPhonetic(r.phonetic_us),
  meanings: parseMeanings(r.meanings_json),
  examples: parsePairs(r.examples_json),
  phrases: parsePairs(r.phrases_json),
});

export async function listBooks(db: SqlDb): Promise<BookRow[]> {
  return db.getAllAsync<BookRow>(
    "SELECT * FROM book ORDER BY CASE exam WHEN 'cet4' THEN 1 WHEN 'cet6' THEN 2 WHEN 'kaoyan' THEN 3 ELSE 4 END",
    [],
  );
}

export async function getBook(db: SqlDb, id: string): Promise<BookRow | null> {
  return db.getFirstAsync<BookRow>('SELECT * FROM book WHERE id = ?', [id]);
}

/** 词书内全部 word_id，按词书顺序 */
export async function getBookWordIds(db: SqlDb, bookId: string): Promise<number[]> {
  const rows = await db.getAllAsync<{ word_id: number }>(
    'SELECT word_id FROM book_word WHERE book_id = ? ORDER BY seq',
    [bookId],
  );
  return rows.map((r) => r.word_id);
}

export async function getWords(
  db: SqlDb,
  ids: readonly number[],
): Promise<Map<number, WordDetail>> {
  const out = new Map<number, WordDetail>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const rows = await db.getAllAsync<WordRow>(
      `SELECT * FROM word WHERE id IN (${chunk.map(() => '?').join(',')})`,
      [...chunk],
    );
    for (const r of rows) out.set(r.id, toDetail(r));
  }
  return out;
}

export async function getMeta(db: SqlDb, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [
    key,
  ]);
  return r?.value ?? null;
}
