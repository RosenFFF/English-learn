/**
 * 题目生成：调用用户配置的 LLM → 解析 JSON → zod 校验；不合格就把精简后的错误回给模型重试。
 * chat 通过依赖注入传入（单测用假的），默认用 src/lib/llm.ts 的 chat。
 */
import type { z } from 'zod';

import { chat as defaultChat, LlmError, type ChatMessage, type LlmConfig } from '../llm';
import { generationMessages, PROMPT_VERSION, retryMessage } from './prompts';
import { PAYLOAD_SCHEMAS, SCHEMA_VERSION, summarizeIssues, type PayloadOf } from './schemas';
import { QUESTION_TYPE_LABEL, type QuestionType } from './types';

export type ChatFn = typeof defaultChat;

export interface LlmDeps {
  cfg: LlmConfig;
  /** 默认用 src/lib/llm.ts 的 chat */
  chat?: ChatFn;
  signal?: AbortSignal;
}

/** 校验失败后最多再问几次 */
export const MAX_JSON_RETRIES = 2;

export type ExamGenErrorKind = 'invalid_json' | 'schema_mismatch';

/** 模型输出始终不合格（重试用完）。网络、鉴权等错误不包装，原样抛 LlmError。 */
export class ExamGenError extends Error {
  constructor(
    public readonly kind: ExamGenErrorKind,
    message: string,
    /** 最后一次的问题明细，便于排查（不含密钥） */
    public readonly detail: string,
  ) {
    super(message);
    this.name = 'ExamGenError';
  }
}

/**
 * 从模型输出里取出 JSON 对象：容忍 ```json 代码块包裹，以及对象前后的说明文字。
 * 取不出对象返回 undefined。
 */
export function extractJson(raw: string): unknown {
  const candidates: string[] = [raw.trim()];
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(raw);
  if (fence) candidates.push(fence[1].trim());
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v: unknown = JSON.parse(c);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch {
      // 换下一个候选
    }
  }
  return undefined;
}

export interface AskJsonOptions<T> {
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  /** 报错里用的中文名，如「选词填空题目」「翻译评分」 */
  what: string;
  temperature: number;
}

/**
 * 发消息、解析、校验，失败时带着精简错误重试，最多 MAX_JSON_RETRIES 次。
 * LlmError（超时、鉴权、取消等）原样抛出，不重试（llm.ts 自己已经对网络错误退避重试过）。
 */
export async function askJson<T>(deps: LlmDeps, opts: AskJsonOptions<T>): Promise<T> {
  const chat = deps.chat ?? defaultChat;
  const messages = [...opts.messages];
  let last: { kind: ExamGenErrorKind; detail: string } | null = null;
  for (let i = 0; i <= MAX_JSON_RETRIES; i++) {
    if (deps.signal?.aborted) throw new LlmError('aborted', '已取消');
    const raw = await chat(deps.cfg, messages, {
      signal: deps.signal,
      temperature: opts.temperature,
    });
    const data = extractJson(raw);
    if (data === undefined) {
      last = { kind: 'invalid_json', detail: '输出不是一个有效的 JSON 对象' };
    } else {
      const parsed = opts.schema.safeParse(data);
      if (parsed.success) return parsed.data;
      last = { kind: 'schema_mismatch', detail: summarizeIssues(parsed.error) };
    }
    messages.push({ role: 'assistant', content: raw }, retryMessage(last.detail));
  }
  const tries = MAX_JSON_RETRIES + 1;
  const err = last!;
  throw new ExamGenError(
    err.kind,
    err.kind === 'invalid_json'
      ? `模型返回的${opts.what}不是有效的 JSON（共尝试 ${tries} 次），请稍后再试或换一个模型`
      : `模型返回的${opts.what}格式不符合要求（共尝试 ${tries} 次），请稍后再试或换一个模型`,
    err.detail,
  );
}

export interface GeneratedQuestion<T extends QuestionType = QuestionType> {
  type: T;
  payload: PayloadOf<T>;
  schemaVersion: number;
  promptVersion: number;
  model: string;
}

/** 生成一道题。最终失败抛 ExamGenError；LlmError 原样抛出。 */
export async function generateQuestion<T extends QuestionType>(
  type: T,
  deps: LlmDeps,
): Promise<GeneratedQuestion<T>> {
  const payload = await askJson(deps, {
    messages: generationMessages(type),
    schema: PAYLOAD_SCHEMAS[type] as unknown as z.ZodType<PayloadOf<T>>,
    what: `${QUESTION_TYPE_LABEL[type]}题目`,
    temperature: 0.8,
  });
  return {
    type,
    payload,
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    model: deps.cfg.model.trim(),
  };
}
