/**
 * 听力板块：出题（题库没做过的旧题优先，不够再让大模型生成并存库）、本地判分、写作答记录；
 * 朗读经 src/platform/speech（expo-speech），队列状态机在 src/lib/listening-player.ts。
 * 页面只经过这里（src/lib、src/db、src/platform 不让页面直接引用）。
 */
import { useReducer } from 'react';

import { getDatabases } from '../../db/open';
import { insertAttempt } from '../../db/questionRepo';
import type { SqlDb } from '../../db/types';
import {
  createListeningSheet,
  gradeListening,
  listeningAnswers,
  type ListeningSet,
} from '../../lib/exam/listening-sheet';
import {
  LISTENING_SPEC,
  isNarrator,
  type ListeningQuestionType,
  type QuestionSpeechItem,
  type SpeechItem,
} from '../../lib/exam/listening';
import { sheetReducer, type AnswerSheet, type SheetAction } from '../../lib/exam/reading';
import type { AttemptRow } from '../../lib/exam/types';
import {
  createSpeechPlayer,
  pickVoices,
  type SpeechDriver,
  type SpeechPlayer,
  type VoicePlan,
} from '../../lib/listening-player';
import { uuidv4 } from '../../lib/uuid';
import { listVoices, speakUtterance, stopSpeech } from '../../platform/speech';
import { readSelectedExam } from '../exam/service';
import { describeGenerationError, LlmNotConfiguredError } from '../generation/llm';
import { loadStoredQuestion, prepareQuestions, type PrepareOptions } from '../generation/questions';
import { getLlmConfig } from '../settings/service';
import { notifyDataChanged } from '../shared';

export { cet6PaperScore } from '../../lib/exam/cet6-score';
export { redoOutcomeText } from '../../lib/exam/mistakes';
export {
  LISTENING_QUESTION_TYPES,
  isListeningQuestionType,
  isNarrator,
  toSpeechQueue,
  type ListeningQuestionType,
  type QuestionSpeechItem,
  type SpeechItem,
} from '../../lib/exam/listening';
export { plainStem } from '../../lib/exam/sanitize';
export { gradeListening, stemVisible, type ListeningSet } from '../../lib/exam/listening-sheet';
export {
  answeredCount,
  letterOf,
  needsExitConfirm,
  submitPrompt,
  type AnswerSheet,
  type GradeResult,
} from '../../lib/exam/reading';
export type { ListeningPayload } from '../../lib/exam/schemas';
export type { PlayerSnapshot, SpeechPlayer, VoicePlan } from '../../lib/listening-player';
export { getGenerationLlmStatus as getListeningLlmStatus } from '../generation/llm';

export interface ListeningTypeMeta {
  type: ListeningQuestionType;
  title: string;
  /** 六级里的位置，如「Section A」 */
  section: string;
  summary: string;
  /** 规模，如「4 题 · 约 200–450 词」 */
  size: string;
}

const size = (t: ListeningQuestionType): string => {
  const s = LISTENING_SPEC[t];
  const q = s.questions[0] === s.questions[1] ? `${s.questions[0]}` : s.questions.join('–');
  return `${q} 题 · ${s.words.join('–')} 词`;
};

export const LISTENING_TYPE_META: Readonly<Record<ListeningQuestionType, ListeningTypeMeta>> = {
  long_conversation: {
    type: 'long_conversation',
    title: '长对话',
    section: 'Section A',
    summary: '一男一女两人对话，听完后逐题念题干，选出正确答案。',
    size: size('long_conversation'),
  },
  passage: {
    type: 'passage',
    title: '听力篇章',
    section: 'Section B',
    summary: '一人朗读一篇短文，听完回答 3–4 道题。',
    size: size('passage'),
  },
  lecture: {
    type: 'lecture',
    title: '讲话 / 讲座',
    section: 'Section C',
    summary: '一段讲座、演讲或广播讲话，篇幅最长，每题分值也最高。',
    size: size('lecture'),
  },
};

export function describeListeningError(e: unknown): string {
  return describeGenerationError(e);
}

// ---------- 出题 ----------

export interface PreparedListening {
  set: ListeningSet;
  /** 题库里读不出来、被跳过的旧题的原因 */
  skipped: string[];
}

export async function prepareListeningSet(
  user: SqlDb,
  type: ListeningQuestionType,
  opts: PrepareOptions,
): Promise<PreparedListening> {
  const { parts, skipped } = await prepareQuestions(user, type, 1, opts);
  const part = parts[0]!;
  return {
    set: { id: uuidv4(), type, questionId: part.id, payload: part.payload },
    skipped: skipped.map((s) => s.error),
  };
}

/** 页面用：读配置、开库、准备一道题。没配大模型抛 LlmNotConfiguredError */
export async function startListeningSet(
  type: ListeningQuestionType,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PreparedListening> {
  const cfg = await getLlmConfig();
  if (!cfg) throw new LlmNotConfiguredError();
  const { user } = await getDatabases();
  const prepared = await prepareListeningSet(user, type, {
    deps: { cfg, signal: opts.signal },
    onProgress: opts.onProgress,
  });
  notifyDataChanged();
  return prepared;
}

/** 错题本重做：题库里的原题，本地判分，不需要大模型 */
export async function prepareListeningRedo(
  user: SqlDb,
  type: ListeningQuestionType,
  questionId: string,
): Promise<PreparedListening> {
  const part = await loadStoredQuestion(user, type, questionId);
  return {
    set: { id: uuidv4(), type, questionId: part.id, payload: part.payload },
    skipped: [],
  };
}

export async function startListeningRedo(
  type: ListeningQuestionType,
  questionId: string,
): Promise<PreparedListening> {
  const { user } = await getDatabases();
  return prepareListeningRedo(user, type, questionId);
}

// ---------- 交卷 ----------

/** 判分并写一行 attempt（规则同阅读：score = 答对题数，wrong_count = 答错含未答，needs_redo = 0） */
export async function saveListeningAttempt(
  user: SqlDb,
  set: ListeningSet,
  sheet: AnswerSheet,
  times: { startedAt: number; submittedAt: number },
): Promise<AttemptRow> {
  const exam = (await readSelectedExam(user)) ?? 'cet6';
  const g = gradeListening(set, sheet);
  const row: AttemptRow = {
    id: uuidv4(),
    question_id: set.questionId,
    exam,
    section: 'listening',
    type: set.type,
    answer: JSON.stringify(listeningAnswers(sheet)),
    score: g.score,
    max_score: g.maxScore,
    feedback: null,
    wrong_count: g.wrongCount,
    needs_redo: 0,
    duration_ms: Math.max(0, times.submittedAt - times.startedAt),
    started_at: times.startedAt,
    submitted_at: times.submittedAt,
  };
  await insertAttempt(user, row);
  return row;
}

export async function submitListeningSet(
  set: ListeningSet,
  sheet: AnswerSheet,
  startedAt: number,
): Promise<{ wrongCount: number }> {
  const { user } = await getDatabases();
  const row = await saveListeningAttempt(user, set, sheet, {
    startedAt,
    submittedAt: Date.now(),
  });
  notifyDataChanged();
  return { wrongCount: row.wrong_count };
}

export function useListeningSheet(set: ListeningSet): [AnswerSheet, (a: SheetAction) => void] {
  return useReducer(sheetReducer, set.payload, createListeningSheet);
}

// ---------- 朗读 ----------

/**
 * 当前这一条如果是旁白在念题，返回这条念题（带 questionIndex 和 displayText）；否则 null。
 * 判断旁白只看 isNarrator（role），不拿 speaker id 比。
 */
export function narratedQuestion(item: SpeechItem | null | undefined): QuestionSpeechItem | null {
  if (!item || !isNarrator(item)) return null;
  return item.kind === 'question' ? item : null;
}

/** 队列里原文（稿子角色念的）有几段：旁白念题不算 */
export function scriptLineCount(items: readonly SpeechItem[]): number {
  return items.filter((i) => !isNarrator(i)).length;
}

/** 系统 TTS 驱动（expo-speech 经 src/platform/speech） */
export const systemSpeechDriver: SpeechDriver = {
  speak: (text, o, cb) =>
    speakUtterance(
      text,
      { language: o.language, rate: o.rate, pitch: o.pitch, voice: o.voice },
      cb,
    ),
  stop: stopSpeech,
};

let voicePlan: Promise<VoicePlan> | null = null;

/** 按性别挑好的音色（只查一次系统音色列表；取不到时降级为默认音色 + 音调区分） */
export function loadVoicePlan(): Promise<VoicePlan> {
  // 网页端音色列表是异步填充的：这次没取到就不缓存，下次进页面再查
  voicePlan ??= listVoices().then((voices) => {
    if (voices.length === 0) voicePlan = null;
    return pickVoices(voices);
  });
  return voicePlan;
}

export function newSpeechPlayer(init: Parameters<typeof createSpeechPlayer>[1]): SpeechPlayer {
  return createSpeechPlayer(systemSpeechDriver, init);
}

/** 语速选项 */
export const SPEECH_RATES = [0.8, 1] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];
