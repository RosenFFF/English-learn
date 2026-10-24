import { toSpeechQueue, type SpeechItem } from './exam/listening';
import { DEMO_LONG_CONVERSATION } from './exam/__testutils__/listening-fixtures';
import {
  createSpeechPlayer,
  FALLBACK_PITCH,
  guessVoiceGender,
  INITIAL_PLAYER,
  pickVoices,
  playerReducer,
  type SpeechDriver,
  type VoiceInfo,
} from './listening-player';

/** mock 朗读驱动：记下每次 speak / stop，手动触发念完或出错 */
function mockDriver() {
  const spoken: { text: string; voice?: string; pitch: number; rate: number }[] = [];
  const pending: { onDone: () => void; onError: (m: string) => void }[] = [];
  let stops = 0;
  const driver: SpeechDriver = {
    speak(text, o, cb) {
      spoken.push({ text, voice: o.voice, pitch: o.pitch, rate: o.rate });
      pending.push(cb);
    },
    stop() {
      stops++;
    },
  };
  return {
    driver,
    spoken,
    stops: () => stops,
    /** 让最近一次 speak 念完 */
    finishLast: () => pending[pending.length - 1]!.onDone(),
    /** 让第 n 次 speak（过期的）念完 */
    finishNth: (n: number) => pending[n]!.onDone(),
    failLast: (m: string) => pending[pending.length - 1]!.onError(m),
  };
}

const items: SpeechItem[] = toSpeechQueue(DEMO_LONG_CONVERSATION);
const scriptLen = DEMO_LONG_CONVERSATION.script.length;

describe('playerReducer', () => {
  it('空队列什么都不做', () => {
    expect(playerReducer(INITIAL_PLAYER, { type: 'play' }, 0)).toBe(INITIAL_PLAYER);
    expect(playerReducer(INITIAL_PLAYER, { type: 'restart' }, 0)).toBe(INITIAL_PLAYER);
  });

  it('播放、念完一条进下一条，最后一条念完是 done；done 再播放从头开始', () => {
    let s = playerReducer(INITIAL_PLAYER, { type: 'play' }, 2);
    expect(s).toMatchObject({ status: 'playing', index: 0, token: 1 });
    s = playerReducer(s, { type: 'finished', token: 1 }, 2);
    expect(s).toMatchObject({ status: 'playing', index: 1, token: 2 });
    s = playerReducer(s, { type: 'finished', token: 2 }, 2);
    expect(s).toMatchObject({ status: 'done', index: 2 });
    s = playerReducer(s, { type: 'play' }, 2);
    expect(s).toMatchObject({ status: 'playing', index: 0 });
  });

  it('过期 token 的回调一律忽略', () => {
    const s = playerReducer(INITIAL_PLAYER, { type: 'play' }, 3);
    const r = playerReducer(s, { type: 'replay' }, 3);
    expect(playerReducer(r, { type: 'finished', token: s.token }, 3)).toBe(r);
    expect(playerReducer(r, { type: 'failed', token: s.token, message: 'x' }, 3)).toBe(r);
  });

  it('暂停后继续从这一条开头重念（换新 token）', () => {
    let s = playerReducer(INITIAL_PLAYER, { type: 'play' }, 3);
    s = playerReducer(s, { type: 'finished', token: s.token }, 3);
    const paused = playerReducer(s, { type: 'pause' }, 3);
    expect(paused).toMatchObject({ status: 'paused', index: 1 });
    // 暂停后旧的回调不再推进
    expect(playerReducer(paused, { type: 'finished', token: paused.token }, 3)).toBe(paused);
    const resumed = playerReducer(paused, { type: 'play' }, 3);
    expect(resumed).toMatchObject({ status: 'playing', index: 1 });
    expect(resumed.token).toBe(paused.token + 1);
  });

  it('重听：念完后重听最后一条；逐句重听念完回到 idle', () => {
    const done = { ...INITIAL_PLAYER, status: 'done' as const, index: 3 };
    expect(playerReducer(done, { type: 'replay' }, 3)).toMatchObject({
      status: 'playing',
      index: 2,
    });
    const one = playerReducer(INITIAL_PLAYER, { type: 'playOne', index: 2 }, 3);
    expect(one).toMatchObject({ status: 'playing', index: 2, mode: 'single' });
    expect(playerReducer(one, { type: 'finished', token: one.token }, 3)).toMatchObject({
      status: 'idle',
      index: 2,
    });
    expect(playerReducer(INITIAL_PLAYER, { type: 'playOne', index: 3 }, 3)).toBe(INITIAL_PLAYER);
    expect(playerReducer(INITIAL_PLAYER, { type: 'playOne', index: -1 }, 3)).toBe(INITIAL_PLAYER);
  });

  it('出错：停在这一条，记下原因；再播放时清空', () => {
    const s = playerReducer(INITIAL_PLAYER, { type: 'play' }, 3);
    const f = playerReducer(s, { type: 'failed', token: s.token, message: '没有可用的音色' }, 3);
    expect(f).toMatchObject({ status: 'paused', index: 0, error: '没有可用的音色' });
    expect(playerReducer(f, { type: 'play' }, 3).error).toBeNull();
  });

  it('reset 回到开头并作废正在念的那条', () => {
    const s = playerReducer(INITIAL_PLAYER, { type: 'play' }, 3);
    const r = playerReducer(s, { type: 'reset' }, 3);
    expect(r).toMatchObject({ status: 'idle', index: 0 });
    expect(r.token).toBeGreaterThan(s.token);
  });
});

describe('createSpeechPlayer（mock 朗读）', () => {
  const plan = {
    female: { voice: 'f', language: 'en-US', pitch: 1 },
    male: { voice: 'm', language: 'en-GB', pitch: 1 },
    distinct: true,
  };

  it('按队列逐条念，按 gender 选音色；念题条由女声旁白念', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    for (let i = 0; i < items.length; i++) d.finishLast();
    expect(d.spoken.map((s) => s.text)).toEqual(items.map((i) => i.text));
    expect(d.spoken[0]!.voice).toBe('f'); // W
    expect(d.spoken[1]!.voice).toBe('m'); // M
    expect(d.spoken[scriptLen]!.voice).toBe('f'); // Narrator
    expect(d.spoken[scriptLen]!.text).toMatch(/^Question 1\. /);
    expect(p.getSnapshot()).toMatchObject({ status: 'done', current: null });
    // 自然念完不需要 stop
    expect(d.stops()).toBe(0);
  });

  it('current 指向正在念的条目，可据此高亮念到的题', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    for (let i = 0; i < scriptLen + 2; i++) d.finishLast();
    const cur = p.getSnapshot().current;
    expect(cur).toMatchObject({ kind: 'question', questionIndex: 2 });
  });

  it('暂停会 stop，继续从这一条开头重念；stop 之后迟到的回调不会串条', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    d.finishLast();
    p.dispatch({ type: 'pause' });
    expect(d.stops()).toBe(1);
    d.finishNth(1); // 系统在 stop 之后补发的 onDone
    expect(p.getSnapshot()).toMatchObject({ status: 'paused', index: 1 });
    p.dispatch({ type: 'play' });
    expect(d.spoken.map((s) => s.text)).toEqual([items[0]!.text, items[1]!.text, items[1]!.text]);
  });

  it('重听本条、从头开始都会先停掉正在念的', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    d.finishLast();
    d.finishLast();
    p.dispatch({ type: 'replay' });
    expect(d.stops()).toBe(1);
    expect(d.spoken.at(-1)!.text).toBe(items[2]!.text);
    p.dispatch({ type: 'restart' });
    expect(d.stops()).toBe(2);
    expect(d.spoken.at(-1)!.text).toBe(items[0]!.text);
  });

  it('改语速：正在念时按新语速重念这一条；没在念时下次生效', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan, rate: 1 });
    p.setRate(0.8);
    expect(d.spoken).toHaveLength(0);
    p.dispatch({ type: 'play' });
    expect(d.spoken[0]!.rate).toBe(0.8);
    p.setRate(1);
    expect(d.stops()).toBe(1);
    expect(d.spoken.map((s) => [s.text, s.rate])).toEqual([
      [items[0]!.text, 0.8],
      [items[0]!.text, 1],
    ]);
    expect(p.getSnapshot().rate).toBe(1);
  });

  it('关掉念题：原文念完就结束；正在念题时关掉会停下', () => {
    const d = mockDriver();
    const scriptOnly = toSpeechQueue(DEMO_LONG_CONVERSATION, { readQuestions: false });
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    for (let i = 0; i < scriptLen + 1; i++) d.finishLast();
    expect(p.getSnapshot().current?.kind).toBe('question');
    p.setItems(scriptOnly);
    expect(d.stops()).toBe(1);
    expect(p.getSnapshot()).toMatchObject({ status: 'done', current: null });

    const d2 = mockDriver();
    const p2 = createSpeechPlayer(d2.driver, { items: scriptOnly, voices: plan });
    p2.dispatch({ type: 'play' });
    for (let i = 0; i < scriptLen; i++) d2.finishLast();
    expect(d2.spoken).toHaveLength(scriptLen);
    expect(p2.getSnapshot().status).toBe('done');
  });

  it('朗读出错：停下并给出原因，不再往下念', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    p.dispatch({ type: 'play' });
    d.failLast('synthesis-failed');
    expect(p.getSnapshot()).toMatchObject({ status: 'paused', error: 'synthesis-failed' });
    expect(d.spoken).toHaveLength(1);
  });

  it('stop（离开页面、交卷）：停下回到开头，之后的回调被忽略', () => {
    const d = mockDriver();
    const p = createSpeechPlayer(d.driver, { items, voices: plan });
    const seen: string[] = [];
    p.subscribe(() => seen.push(p.getSnapshot().status));
    p.dispatch({ type: 'play' });
    p.stop();
    expect(d.stops()).toBeGreaterThanOrEqual(1);
    d.finishNth(0);
    expect(p.getSnapshot()).toMatchObject({ status: 'idle', index: 0 });
    expect(d.spoken).toHaveLength(1);
    expect(seen).toEqual(['playing', 'idle']);
  });
});

describe('音色', () => {
  const v = (
    identifier: string,
    name: string,
    language: string,
    quality = 'Default',
  ): VoiceInfo => ({
    identifier,
    name,
    language,
    quality,
  });

  it('guessVoiceGender：常见系统音色名和 Android 代号', () => {
    expect(guessVoiceGender(v('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US'))).toBe(
      'female',
    );
    expect(guessVoiceGender(v('com.apple.eloquence.en-GB.Daniel', 'Daniel', 'en-GB'))).toBe('male');
    expect(
      guessVoiceGender(v('Google UK English Female', 'Google UK English Female', 'en-GB')),
    ).toBe('female');
    expect(guessVoiceGender(v('Google UK English Male', 'Google UK English Male', 'en-GB'))).toBe(
      'male',
    );
    expect(guessVoiceGender(v('en-us-x-sfg-local', 'en-us-x-sfg-local', 'en-US'))).toBe('female');
    expect(guessVoiceGender(v('en-us-x-iom-network', 'en-us-x-iom-network', 'en-US'))).toBe('male');
    expect(
      guessVoiceGender(v('en-us-x-sfg#male_2-local', 'en-us-x-sfg#male_2-local', 'en-US')),
    ).toBe('male');
    expect(guessVoiceGender(v('Google US English', 'Google US English', 'en-US'))).toBeNull();
  });

  it('pickVoices：只用英语，en-US 优先，同语言 Enhanced 优先', () => {
    const plan = pickVoices([
      v('zh-f', 'Tingting female', 'zh-CN'),
      v('gb-f', 'Serena', 'en-GB'),
      v('us-f', 'Samantha', 'en-US'),
      v('us-f-enh', 'Ava', 'en-US', 'Enhanced'),
      v('gb-m', 'Daniel', 'en-GB'),
    ]);
    expect(plan).toEqual({
      female: { voice: 'us-f-enh', language: 'en-US', pitch: 1 },
      male: { voice: 'gb-m', language: 'en-GB', pitch: 1 },
      distinct: true,
    });
  });

  it('Android 的 en_US 写法也认', () => {
    const plan = pickVoices([v('en-us-x-tpf-local', 'en-us-x-tpf-local', 'en_US')]);
    expect(plan.female).toEqual({ voice: 'en-us-x-tpf-local', language: 'en-US', pitch: 1 });
  });

  it('只挑到一种性别：另一种用同一音色并用音调区分', () => {
    const plan = pickVoices([v('us-f', 'Samantha', 'en-US')]);
    expect(plan.distinct).toBe(false);
    expect(plan.female).toEqual({ voice: 'us-f', language: 'en-US', pitch: 1 });
    expect(plan.male).toEqual({ voice: 'us-f', language: 'en-US', pitch: FALLBACK_PITCH.male });
  });

  it('猜不出性别：用第一个英语音色，靠音调区分；一个英语音色都没有用系统默认', () => {
    expect(pickVoices([v('x', 'Google US English', 'en-US')])).toEqual({
      female: { voice: 'x', language: 'en-US', pitch: FALLBACK_PITCH.female },
      male: { voice: 'x', language: 'en-US', pitch: FALLBACK_PITCH.male },
      distinct: false,
    });
    expect(pickVoices([v('zh', 'Tingting', 'zh-CN')])).toEqual({
      female: { language: 'en-US', pitch: FALLBACK_PITCH.female },
      male: { language: 'en-US', pitch: FALLBACK_PITCH.male },
      distinct: false,
    });
    expect(pickVoices([]).distinct).toBe(false);
  });
});
