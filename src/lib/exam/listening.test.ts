import { LlmError, type ChatMessage, type LlmConfig } from '../llm';
import { LEGACY_LISTENING_PAYLOADS, speech, VALID_PAYLOADS } from './__testutils__/fixtures';
import { ExamGenError, generateQuestion, type ChatFn } from './generate';
import {
  countWords,
  isListeningQuestionType,
  isListeningSectionType,
  LISTENING_QUESTION_TYPES,
  LISTENING_SPEC,
  NARRATOR_ROLE,
  questionPrefix,
  SCRIPT_SEGMENT_MAX_CHARS,
  scriptWordCount,
  toSpeechQueue,
  type ListeningQuestionType,
} from './listening';
import { generationMessages, PROMPT_VERSION } from './prompts';
import {
  GENERATION_SCHEMAS,
  legacyTranscriptToBody,
  PAYLOAD_SCHEMAS,
  parseStoredPayload,
  SCHEMA_VERSION,
  summarizeIssues,
  type ListeningPayload,
} from './schemas';
import { QUESTION_TYPES } from './types';

const cfg: LlmConfig = { baseUrl: 'https://example.com/v1', apiKey: 'sk', model: 'm' };
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = (t: ListeningQuestionType): Raw => structuredClone(VALID_PAYLOADS[t]) as Raw;

function gen(t: ListeningQuestionType, data: unknown) {
  return GENERATION_SCHEMAS[t].safeParse(data);
}
function issues(t: ListeningQuestionType, data: unknown): string {
  const r = gen(t, data);
  if (r.success) throw new Error('应该校验失败');
  return summarizeIssues(r.error, 20);
}
function fakeChat(...replies: (string | Error)[]) {
  const calls: ChatMessage[][] = [];
  const fn = jest.fn(async (_c: LlmConfig, messages: ChatMessage[]) => {
    calls.push([...messages]);
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  });
  return { chat: fn as unknown as ChatFn, calls, fn };
}

describe('题型与常量', () => {
  it('LISTENING_QUESTION_TYPES 与 types.ts 里 section 为 listening 的题型一致', () => {
    expect(QUESTION_TYPES.filter(isListeningSectionType)).toEqual([...LISTENING_QUESTION_TYPES]);
    expect(isListeningQuestionType('lecture')).toBe(true);
    expect(isListeningQuestionType('essay')).toBe(false);
    expect(isListeningQuestionType(1)).toBe(false);
  });
  it('长对话 2 个角色 4 题，短文、讲座 1 个角色 3 到 4 题', () => {
    expect(LISTENING_SPEC.long_conversation).toMatchObject({ roles: 2, questions: [4, 4] });
    expect(LISTENING_SPEC.passage).toMatchObject({ roles: 1, questions: [3, 4] });
    expect(LISTENING_SPEC.lecture).toMatchObject({ roles: 1, questions: [3, 4] });
    for (const t of LISTENING_QUESTION_TYPES) {
      const { words, segments } = LISTENING_SPEC[t];
      expect(words[0]).toBeLessThan(words[1]);
      expect(segments[0]).toBeLessThanOrEqual(segments[1]);
    }
  });
});

describe('countWords', () => {
  it.each([
    ['', 0],
    ['Hello, world!', 2],
    ["I don't think it's well-known.", 5],
    ['In 2024 we met 3 times.', 6],
    ['  — … ', 0],
  ])('%p → %p', (t, n) => expect(countWords(t)).toBe(n));
  it('scriptWordCount 合计各段', () => {
    expect(scriptWordCount([{ text: 'a b' }, { text: 'c' }])).toBe(3);
  });
  it('fixture 的 speech(n) 恰好 n 词', () => {
    expect(countWords(speech(37, 'turn one'))).toBe(37);
  });
});

describe('v3 schema：合格样例', () => {
  it.each(LISTENING_QUESTION_TYPES)('%s 生成和读题 schema 都通过', (t) => {
    expect(gen(t, VALID_PAYLOADS[t]).success).toBe(true);
    expect(PAYLOAD_SCHEMAS[t].safeParse(VALID_PAYLOADS[t]).success).toBe(true);
  });
  it('生成时必须带 topic', () => {
    const { topic: _t, ...rest } = clone('lecture');
    expect(issues('lecture', rest)).toMatch(/topic/);
  });
});

describe('v3 schema：角色表', () => {
  it('长对话必须 2 个角色，短文、讲座必须 1 个', () => {
    const lc = clone('long_conversation');
    lc.roles = lc.roles.slice(0, 1);
    expect(issues('long_conversation', lc)).toMatch(/必须 2 个角色/);
    const p = clone('passage');
    p.roles.push({ id: 'X', name: 'X', gender: 'female' });
    expect(issues('passage', p)).toMatch(/必须 1 个角色/);
  });
  it('speaker 必须在角色表里', () => {
    const p = clone('long_conversation');
    p.script[3].speaker = 'Q';
    expect(issues('long_conversation', p)).toMatch(/script\.3\.speaker: speaker "Q" 不在角色表里/);
  });
  it('角色 id 不能重复（不区分大小写）', () => {
    const p = clone('long_conversation');
    p.roles[1].id = 'w';
    expect(issues('long_conversation', p)).toMatch(/角色 id 不能重复/);
  });
  it('长对话两个角色必须一男一女', () => {
    const p = clone('long_conversation');
    p.roles[1].gender = 'female';
    expect(issues('long_conversation', p)).toMatch(/一男一女/);
  });
  it('每个角色至少说一段', () => {
    const p = clone('long_conversation');
    p.script.forEach((s: Raw) => (s.speaker = 'W'));
    expect(issues('long_conversation', p)).toMatch(/角色 M 一句话也没说/);
  });
  it.each([
    ['id 不合法', { id: '1 bad', name: 'N', gender: 'male' }],
    ['gender 不合法', { id: 'N', name: 'N', gender: 'neutral' }],
    ['称呼为空', { id: 'N', name: ' \u200b ', gender: 'male' }],
  ])('%s', (_n, role) => {
    const p = clone('passage');
    p.roles = [role];
    p.script.forEach((s: Raw) => (s.speaker = role.id));
    expect(gen('passage', p).success).toBe(false);
  });
  it('模型多给的平台 voice id 等字段被丢掉', () => {
    const p = clone('passage');
    p.roles[0].voice = 'com.apple.voice.compact.en-US.Samantha';
    const r = gen('passage', p);
    expect(r.success && r.data.roles[0]).toEqual({ id: 'N', name: 'Narrator', gender: 'male' });
  });
});

describe('v3 schema：稿子', () => {
  it('总词数低于下限、超过上限都不合格', () => {
    const [min, max] = LISTENING_SPEC.lecture.words;
    const short = clone('lecture');
    short.script = [
      { speaker: 'L', text: speech(100, 'short') },
      { speaker: 'L', text: speech(min - 101, 'short') },
    ];
    expect(issues('lecture', short)).toMatch(
      new RegExp(`稿子共 ${min - 1} 个英文词，应在 ${min} 到 ${max} 之间`),
    );
    const long = clone('lecture');
    long.script = Array.from({ length: 3 }, () => ({ speaker: 'L', text: speech(170, 'long') }));
    expect(issues('lecture', long)).toMatch(/稿子共 510 个英文词/);
  });
  it('段数有上下限', () => {
    const p = clone('long_conversation');
    p.script = p.script.slice(0, 4).map((s: Raw) => ({ ...s, text: speech(60, 'x') }));
    expect(issues('long_conversation', p)).toMatch(/稿子至少 6 段/);
  });
  it('单段超过字符上限不合格（不截断）', () => {
    const p = clone('lecture');
    p.script = [{ speaker: 'L', text: 'word '.repeat(SCRIPT_SEGMENT_MAX_CHARS / 5 + 10) }];
    expect(issues('lecture', p)).toMatch(new RegExp(`单段不能超过 ${SCRIPT_SEGMENT_MAX_CHARS}`));
  });
  it('稿子不能含中文', () => {
    const p = clone('passage');
    p.script[0].text += ' 你好';
    expect(issues('passage', p)).toMatch(/稿子必须是英文/);
  });
  it('清洗：去掉控制字符、零宽字符、舞台说明、Markdown、HTML 和 emoji', () => {
    const p = clone('passage');
    p.script[0].text = `[laughs] **Good** morning\u0000\u200b <b>everyone</b> (pause) 😀 ! ${p.script[0].text}`;
    const r = gen('passage', p);
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.script[0].text.startsWith('Good morning everyone! part one')).toBe(true);
  });
  it('去掉段首误加的说话人前缀（只认角色 id 和称呼）', () => {
    const p = clone('long_conversation');
    p.script[0].text = `W: ${p.script[0].text}`;
    p.script[1].text = `Man： ${p.script[1].text}`;
    p.script[2].text = `Remember: ${p.script[2].text}`;
    const r = gen('long_conversation', p);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.script[0].text.startsWith('turn 1')).toBe(true);
      expect(r.data.script[1].text.startsWith('turn 2')).toBe(true);
      expect(r.data.script[2].text.startsWith('Remember: turn 3')).toBe(true);
    }
  });
  it('只剩标记、清洗后为空的段不合格', () => {
    const p = clone('passage');
    p.script.push({ speaker: 'N', text: '[music] **' });
    expect(issues('passage', p)).toMatch(/script\.2\.text: 不能为空/);
  });
});

describe('v3 schema：选择题', () => {
  it('答案必须是 A 到 D', () => {
    const p = clone('passage');
    p.questions[0].answer = 'E';
    expect(issues('passage', p)).toMatch(/questions\.0\.answer/);
  });
  it('四个选项不能重复、必须 4 个', () => {
    const p = clone('lecture');
    p.questions[1].options[3] = p.questions[1].options[0];
    expect(issues('lecture', p)).toMatch(/选项有重复/);
    const q = clone('lecture');
    q.questions[0].options.pop();
    expect(issues('lecture', q)).toMatch(/每题必须 4 个选项/);
  });
});

describe('toSpeechQueue', () => {
  const parsed = () => {
    const p = gen('long_conversation', VALID_PAYLOADS.long_conversation);
    if (!p.success) throw new Error('fixture 不合格');
    return p.data;
  };

  it('默认：先按稿子顺序念原文（带角色称呼和 gender），再由旁白按顺序念题', () => {
    const data = parsed();
    const q = toSpeechQueue(data);
    expect(q).toHaveLength(8 + 4);
    expect(q[0]).toEqual({
      kind: 'script',
      speaker: 'W',
      name: 'Woman',
      gender: 'female',
      text: data.script[0].text,
    });
    expect(q[1]).toMatchObject({ kind: 'script', speaker: 'M', name: 'Man', gender: 'male' });
    expect(q.slice(0, 8).every((x) => x.kind === 'script')).toBe(true);
    const questions = q.slice(8);
    expect(questions.map((x) => x.kind)).toEqual(['question', 'question', 'question', 'question']);
    expect(questions.map((x) => (x.kind === 'question' ? x.questionIndex : -1))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(questions[0]).toEqual({
      kind: 'question',
      questionIndex: 0,
      speaker: NARRATOR_ROLE.id,
      name: NARRATOR_ROLE.name,
      gender: NARRATOR_ROLE.gender,
      text: `Question 1. ${data.questions[0].stem}`,
    });
    expect(questions[3].text).toBe(`Question 4. ${data.questions[3].stem}`);
  });

  it('念题只念题干，不念任何选项', () => {
    const data = parsed();
    const text = toSpeechQueue(data)
      .filter((x) => x.kind === 'question')
      .map((x) => x.text)
      .join('\n');
    for (const opt of data.questions.flatMap((x) => x.options)) expect(text).not.toContain(opt);
  });

  it('readQuestions: false 时只念原文', () => {
    const data = parsed();
    const q = toSpeechQueue(data, { readQuestions: false });
    expect(q).toHaveLength(8);
    expect(q.every((x) => x.kind === 'script')).toBe(true);
    expect(toSpeechQueue(data, { readQuestions: true })).toHaveLength(12);
  });

  it('题干同样经过 cleanSpeechText；清洗后为空只念前缀', () => {
    const q = toSpeechQueue({
      roles: [{ id: 'N', name: 'Narrator', gender: 'male' }],
      script: [{ speaker: 'N', text: 'One.' }],
      questions: [{ stem: '**What** is [pause] the\u200b main idea?' }, { stem: '[music]' }],
    });
    expect(q.slice(1).map((x) => x.text)).toEqual([
      'Question 1. What is the main idea?',
      'Question 2.',
    ]);
    expect(questionPrefix(9)).toBe('Question 10.');
  });

  it('旁白角色是固定常量', () => {
    expect(NARRATOR_ROLE).toEqual({ id: 'narrator', name: 'Narrator', gender: 'female' });
  });

  it('角色表里没有的 speaker 跳过；没有 questions 时只有原文', () => {
    const payload: Pick<ListeningPayload, 'roles' | 'script'> = {
      roles: [{ id: 'N', name: 'Narrator', gender: 'male' }],
      script: [
        { speaker: 'N', text: 'One.' },
        { speaker: 'X', text: 'Two.' },
      ],
    };
    expect(toSpeechQueue(payload)).toEqual([
      { kind: 'script', speaker: 'N', name: 'Narrator', gender: 'male', text: 'One.' },
    ]);
  });
});

describe('旧题兼容（schema v1、v2 的 transcript 结构）', () => {
  it('v2 长对话读出后转成 v3：W → female、M → male', () => {
    const r = parseStoredPayload(
      'long_conversation',
      2,
      JSON.stringify(LEGACY_LISTENING_PAYLOADS.long_conversation),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.topic).toBe('a business trip');
    expect(r.payload.roles).toEqual([
      { id: 'W', name: 'W', gender: 'female' },
      { id: 'M', name: 'M', gender: 'male' },
    ]);
    expect(r.payload.script).toEqual([
      { speaker: 'W', text: 'Hi, how was the trip?' },
      { speaker: 'M', text: 'Great, thanks.' },
    ]);
    expect(toSpeechQueue(r.payload, { readQuestions: false }).map((x) => x.gender)).toEqual([
      'female',
      'male',
    ]);
  });
  it('v1 短文没有 topic 也能读；猜不出性别的默认 female', () => {
    const { topic: _t, ...old } = LEGACY_LISTENING_PAYLOADS.passage;
    const r = parseStoredPayload('passage', 1, JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.topic).toBeUndefined();
      expect(r.payload.roles).toEqual([{ id: 'Narrator', name: 'Narrator', gender: 'female' }]);
    }
  });
  it('v2 旧题必须有 topic', () => {
    const { topic: _t, ...old } = LEGACY_LISTENING_PAYLOADS.lecture;
    expect(parseStoredPayload('lecture', 2, JSON.stringify(old)).ok).toBe(false);
  });
  it('旧题不检查新加的词数下限（老题很短也能读）', () => {
    expect(
      parseStoredPayload('lecture', 2, JSON.stringify(LEGACY_LISTENING_PAYLOADS.lecture)).ok,
    ).toBe(true);
  });
  it('v3 题必须是新结构；v2 题必须是旧结构', () => {
    expect(
      parseStoredPayload('lecture', 3, JSON.stringify(LEGACY_LISTENING_PAYLOADS.lecture)).ok,
    ).toBe(false);
    expect(parseStoredPayload('lecture', 2, JSON.stringify(VALID_PAYLOADS.lecture)).ok).toBe(false);
    expect(parseStoredPayload('lecture', 3, JSON.stringify(VALID_PAYLOADS.lecture)).ok).toBe(true);
  });
  it('读题 schema（PAYLOAD_SCHEMAS）新旧结构都接受，旧结构转成新结构', () => {
    const r = PAYLOAD_SCHEMAS.long_conversation.safeParse(
      LEGACY_LISTENING_PAYLOADS.long_conversation,
    );
    expect(r.success && 'roles' in r.data && r.data.roles.length).toBe(2);
  });
  it('旧题的业务规则照旧检查（长对话至少 2 位说话人）', () => {
    const bad = structuredClone(LEGACY_LISTENING_PAYLOADS.long_conversation);
    bad.transcript.forEach((l) => (l.speaker = 'W'));
    expect(parseStoredPayload('long_conversation', 2, JSON.stringify(bad)).ok).toBe(false);
  });
  it('legacyTranscriptToBody：称呼不能当 id 的换成 S1…，性别猜不出时女、男交替', () => {
    const body = legacyTranscriptToBody({
      transcript: [
        { speaker: 'Speaker 1', text: 'Hello [laughs] there.' },
        { speaker: 'Speaker 2', text: 'Hi.' },
        { speaker: 'Mrs. Green', text: 'Morning.' },
      ],
      questions: [],
    });
    expect(body.roles).toEqual([
      { id: 'S1', name: 'Speaker 1', gender: 'female' },
      { id: 'S2', name: 'Speaker 2', gender: 'male' },
      { id: 'S3', name: 'Mrs. Green', gender: 'female' },
    ]);
    expect(body.script[0]).toEqual({ speaker: 'S1', text: 'Hello there.' });
  });
  it('legacyTranscriptToBody：id 冲突时加后缀', () => {
    const body = legacyTranscriptToBody({
      transcript: [
        { speaker: 'S2', text: 'a' },
        { speaker: 'Bad id', text: 'b' },
      ],
      questions: [],
    });
    expect(body.roles.map((r) => r.id)).toEqual(['S2', 'S2_']);
    expect(body.script.map((s) => s.speaker)).toEqual(['S2', 'S2_']);
  });
});

describe('生成：prompt 与 generateQuestion', () => {
  it.each(LISTENING_QUESTION_TYPES)('%s：prompt 写明原创、角色表、词数和题数', (t) => {
    const [system, user] = generationMessages(t);
    const { words, questions } = LISTENING_SPEC[t];
    expect(system.content).toMatch(/原创/);
    expect(user.content).toMatch(/不得使用、复述或改写任何六级或其它考试的真题录音原文/);
    expect(user.content).toContain(`${words[0]} 到 ${words[1]} 个英文词`);
    expect(user.content).toContain(
      questions[0] === questions[1]
        ? `配 ${questions[0]} 道`
        : `配 ${questions[0]} 到 ${questions[1]} 道`,
    );
    expect(user.content).toMatch(/"roles"/);
    expect(user.content).toMatch(/"gender"/);
    expect(user.content).toMatch(/不要舞台说明/);
    expect(user.content).not.toMatch(/transcript/);
  });

  it('长对话 prompt 要求一男一女', () => {
    expect(generationMessages('long_conversation')[1].content).toMatch(/一男一女/);
  });

  it('词数不够时把具体词数回给模型重试，成功后返回 v3 题目', async () => {
    const short = clone('passage');
    short.script = [{ speaker: 'N', text: speech(50, 'tiny') }];
    const { chat, calls, fn } = fakeChat(
      JSON.stringify(short),
      JSON.stringify(VALID_PAYLOADS.passage),
    );
    const q = await generateQuestion('passage', { cfg, chat, avoidTopics: ['ocean plastic'] });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[0][1].content).toContain('- "ocean plastic"');
    expect(calls[1][3].content).toMatch(/稿子共 50 个英文词，应在 180 到 380 之间/);
    expect(q).toMatchObject({
      type: 'passage',
      schemaVersion: SCHEMA_VERSION,
      promptVersion: PROMPT_VERSION,
      model: 'm',
    });
    expect(SCHEMA_VERSION).toBe(3);
    expect(toSpeechQueue(q.payload)).toHaveLength(2 + 3);
  });

  it('模型一直给旧结构（transcript）：重试用完抛 ExamGenError', async () => {
    const { chat, fn } = fakeChat(JSON.stringify(LEGACY_LISTENING_PAYLOADS.lecture));
    const p = generateQuestion('lecture', { cfg, chat });
    await expect(p).rejects.toBeInstanceOf(ExamGenError);
    await expect(p).rejects.toMatchObject({
      kind: 'schema_mismatch',
      message: expect.stringMatching(/听力·讲座题目格式不符合要求/),
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('LlmError 原样抛出，不重试', async () => {
    const err = new LlmError('timeout', '请求超时');
    const { chat, fn } = fakeChat(err);
    await expect(generateQuestion('long_conversation', { cfg, chat })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
