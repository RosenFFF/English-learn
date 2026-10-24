import type { BookExam } from '../../db/wordsRepo';
import type { ChatMessage } from '../../lib/llm';

export type AiKind = 'explain_word' | 'explain_sentence';

const EXAM_NAME: Record<BookExam, string> = {
  cet4: '大学英语四级',
  cet6: '大学英语六级',
  kaoyan: '考研英语',
  ielts: '雅思',
};

const SYSTEM =
  '你是一位耐心、准确的中国英语考试老师。用简体中文回答，内容简洁，使用 Markdown 小标题和列表，不要寒暄。不确定的内容不要编造。';

export interface WordContext {
  headword: string;
  meaningsZh: string[];
  exam: BookExam;
}

export function explainWordMessages(w: WordContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: [
        `请为备考${EXAM_NAME[w.exam]}的学生讲解单词「${w.headword}」。词库释义：${w.meaningsZh.join('；') || '无'}。`,
        '按以下结构输出：',
        '1. 核心含义（最常考的 1 到 3 个义项）',
        '2. 记忆方法（词根词缀或联想，一两句）',
        `3. 两个贴近${EXAM_NAME[w.exam]}难度的例句，每句附中文翻译`,
        '4. 常考搭配或易混词（没有就省略）',
      ].join('\n'),
    },
  ];
}

export function explainSentenceMessages(sentence: string, exam: BookExam): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `请拆解这个${EXAM_NAME[exam]}难度的句子，说明主干、从句和难点词，再给出通顺的中文翻译：\n\n${sentence}`,
    },
  ];
}
