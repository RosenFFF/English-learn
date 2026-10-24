/** AI 讲解：先查 ai_cache，没有再调用用户自己配置的大模型。 */
import { getDatabases } from '../../db/open';
import { getAiCache, putAiCache } from '../../db/userRepo';
import type { BookExam } from '../../db/wordsRepo';
import { chat } from '../../lib/llm';
import type { WordDetail } from '../../lib/words';
import { getLlmConfig, describeLlmError } from '../settings/service';
import { explainWordMessages } from './prompts';

export async function isAiConfigured(): Promise<boolean> {
  return (await getLlmConfig()) !== null;
}

export type ExplainResult =
  { ok: true; text: string; cached: boolean } | { ok: false; message: string };

export async function explainWord(
  word: WordDetail,
  exam: BookExam,
  signal?: AbortSignal,
): Promise<ExplainResult> {
  const cfg = await getLlmConfig();
  if (!cfg) return { ok: false, message: '请先在「我的 → 大模型设置」里填写接口' };
  const { user } = await getDatabases();
  const cached = await getAiCache(user, word.id, 'explain_word', cfg.model);
  if (cached) return { ok: true, text: cached, cached: true };
  try {
    const text = await chat(
      cfg,
      explainWordMessages({
        headword: word.headword,
        meaningsZh: word.meanings.map((m) => `${m.pos ? `${m.pos}. ` : ''}${m.zh}`),
        exam,
      }),
      { signal },
    );
    await putAiCache(user, word.id, 'explain_word', cfg.model, text, Date.now());
    return { ok: true, text, cached: false };
  } catch (e) {
    return { ok: false, message: describeLlmError(e) };
  }
}
