/**
 * 听力板块的常量和纯函数（不依赖 zod / React / Expo）。
 * - LISTENING_SPEC：三种题型的角色数、题数、稿子词数范围（schema 和 prompt 共用）；
 * - countWords：按英文词数计稿子长度；
 * - toSpeechQueue：把题目里的分角色稿子展开成朗读队列，前端逐条交给 expo-speech。
 * 这里只给出角色的 gender 等属性，不写任何平台 voice id；音色由前端按 gender 挑选。
 */
import type { ListeningPayload } from './schemas';
import { QUESTION_SECTION, type QuestionType } from './types';

/** 听力板块的三种题型（= types.ts 里 section 为 listening 的题型，单测校验） */
export const LISTENING_QUESTION_TYPES = [
  'long_conversation',
  'passage',
  'lecture',
] as const satisfies readonly QuestionType[];
export type ListeningQuestionType = (typeof LISTENING_QUESTION_TYPES)[number];

export function isListeningQuestionType(v: unknown): v is ListeningQuestionType {
  return typeof v === 'string' && (LISTENING_QUESTION_TYPES as readonly string[]).includes(v);
}

/** 题型是不是属于听力板块（和 LISTENING_QUESTION_TYPES 互相校验） */
export const isListeningSectionType = (t: QuestionType): boolean =>
  QUESTION_SECTION[t] === 'listening';

/** 角色性别：前端据此选音色 */
export const SPEAKER_GENDERS = ['female', 'male'] as const;
export type SpeakerGender = (typeof SPEAKER_GENDERS)[number];

export interface ListeningSpec {
  /** 角色数 */
  roles: number;
  /** 题数范围（含端点） */
  questions: readonly [number, number];
  /** 稿子总词数范围（英文词，含端点） */
  words: readonly [number, number];
  /** 稿子段数范围 */
  segments: readonly [number, number];
}

/**
 * 参考六级听力结构：Section A 长对话（每篇 4 题）、Section B 短文（每篇 3–4 题）、
 * Section C 讲座 / 讲话（每篇 3–4 题）。词数按六级录音常见篇幅放宽一些。
 */
export const LISTENING_SPEC: Readonly<Record<ListeningQuestionType, ListeningSpec>> = {
  long_conversation: { roles: 2, questions: [4, 4], words: [200, 450], segments: [6, 30] },
  passage: { roles: 1, questions: [3, 4], words: [180, 380], segments: [1, 12] },
  lecture: { roles: 1, questions: [3, 4], words: [250, 500], segments: [1, 15] },
};

/** 单段稿子最多多少字符（expo-speech / 系统 TTS 单次朗读长度有限，留足余量） */
export const SCRIPT_SEGMENT_MAX_CHARS = 1200;
/** 角色 id：字母开头，字母数字、下划线、连字符，最长 16 */
export const SPEAKER_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,15}$/;
/** 角色称呼最长字符数 */
export const SPEAKER_NAME_MAX = 40;

const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/** 英文词数（缩写 don't、连字符词 well-known 各算 1 个） */
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** 稿子总词数 */
export function scriptWordCount(script: readonly { text: string }[]): number {
  return script.reduce((n, s) => n + countWords(s.text), 0);
}

/** 朗读队列的一项 */
export interface SpeechItem {
  /** 角色 id（= roles[].id） */
  speaker: string;
  /** 角色称呼，如 "Woman"、"Professor Lee" */
  name: string;
  gender: SpeakerGender;
  /** 要朗读的文字（已清洗，不含舞台说明、Markdown 等标记） */
  text: string;
}

/**
 * 把稿子展开成朗读队列，顺序与 script 一致。
 * speaker 不在角色表里的段（schema 已经拦住，理论上不会出现）会被跳过。
 */
export function toSpeechQueue(payload: Pick<ListeningPayload, 'roles' | 'script'>): SpeechItem[] {
  const roles = new Map(payload.roles.map((r) => [r.id, r]));
  const out: SpeechItem[] = [];
  for (const seg of payload.script) {
    const role = roles.get(seg.speaker);
    if (!role) continue;
    out.push({ speaker: role.id, name: role.name, gender: role.gender, text: seg.text });
  }
  return out;
}
