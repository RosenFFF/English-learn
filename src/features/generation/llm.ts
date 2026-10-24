/**
 * 现场出题的板块（阅读、翻译、写作……）共用：大模型配置检查、出题 / 评分失败的中文说明。
 */
import { ExamGenError } from '../../lib/exam/generate';
import { LlmError } from '../../lib/llm';
import { describeLlmError, getLlmConfig, loadLlmSettings } from '../settings/service';

export type GenerationLlmStatus =
  | { ready: true }
  | {
      ready: false;
      /** 缺了哪几项，如 ['接口地址', '模型名'] */
      missing: string[];
      /** 保存过密钥但现在解不开 */
      keyUnreadable: boolean;
    };

/** 能不能出题：接口地址、密钥、模型名都齐了才行 */
export async function getGenerationLlmStatus(): Promise<GenerationLlmStatus> {
  if (await getLlmConfig()) return { ready: true };
  const s = await loadLlmSettings();
  const missing = [
    s.baseUrl.trim() ? null : '接口地址',
    s.hasKey ? null : '密钥',
    s.model.trim() ? null : '模型名',
  ].filter((x): x is string => x !== null);
  return { ready: false, missing, keyUnreadable: s.keyUnreadable };
}

/** 没配大模型时出题 / 评分 */
export class LlmNotConfiguredError extends Error {
  constructor() {
    super('还没有配置大模型：请先在「大模型设置」里填写接口地址、密钥和模型名');
    this.name = 'LlmNotConfiguredError';
  }
}

/** 出题 / 评分失败时给用户看的中文说明；what 是「出题」「评分」 */
export function describeGenerationError(e: unknown, what = '出题'): string {
  if (e instanceof ExamGenError || e instanceof LlmNotConfiguredError) return e.message;
  if (e instanceof LlmError) return `${what}失败：${describeLlmError(e)}`;
  return `${what}失败：${e instanceof Error ? e.message : String(e)}`;
}

export function isAbort(e: unknown): boolean {
  return e instanceof LlmError && e.kind === 'aborted';
}
