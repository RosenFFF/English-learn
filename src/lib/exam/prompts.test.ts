import {
  ANSWER_MAX_CHARS,
  generationMessages,
  GRADE_PROMPT_VERSION,
  PROMPT_VERSION,
} from './prompts';
import { QUESTION_TYPES } from './types';

describe('生成 prompt', () => {
  it('PROMPT_VERSION 是正整数', () => {
    expect(Number.isInteger(PROMPT_VERSION) && PROMPT_VERSION > 0).toBe(true);
  });

  it('评分 prompt 版本为 2，作答长度上限为正整数', () => {
    expect(GRADE_PROMPT_VERSION).toBe(2);
    expect(Object.values(ANSWER_MAX_CHARS).every((n) => Number.isInteger(n) && n > 0)).toBe(true);
  });

  it.each(QUESTION_TYPES)('%s：要求只输出 JSON、原创、对齐六级', (type) => {
    const [system, user] = generationMessages(type);
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/只输出一个 JSON 对象/);
    expect(system.content).toMatch(/原创/);
    expect(system.content).toMatch(/不得复述、改写/);
    expect(system.content).toMatch(/六级/);
    expect(user.content).toMatch(/输出格式/);
  });
});
