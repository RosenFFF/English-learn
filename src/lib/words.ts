/** words.db 中 JSON 字段的解析（纯函数，容错：坏数据返回空数组，不让卡片崩溃） */

export interface Meaning {
  pos: string;
  zh: string;
}
export interface Example {
  en: string;
  zh: string;
}
export type Phrase = Example;

export interface WordDetail {
  id: number;
  headword: string;
  phoneticUk: string | null;
  phoneticUs: string | null;
  meanings: Meaning[];
  examples: Example[];
  phrases: Phrase[];
}

function parseArray<T>(
  json: string | null | undefined,
  pick: (o: Record<string, unknown>) => T | null,
): T[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    const out: T[] = [];
    for (const item of v) {
      if (item && typeof item === 'object') {
        const t = pick(item as Record<string, unknown>);
        if (t) out.push(t);
      }
    }
    return out;
  } catch {
    return [];
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function parseMeanings(json: string | null | undefined): Meaning[] {
  return parseArray(json, (o) => (str(o.zh) ? { pos: str(o.pos), zh: str(o.zh) } : null));
}

export function parsePairs(json: string | null | undefined): Example[] {
  return parseArray(json, (o) => (str(o.en) ? { en: str(o.en), zh: str(o.zh) } : null));
}

/** 音标统一加斜杠显示，原数据可能已经带了 */
export function formatPhonetic(p: string | null | undefined): string | null {
  const t = (p ?? '').trim().replace(/^[/[]|[/\]]$/g, '');
  return t ? `/${t}/` : null;
}
