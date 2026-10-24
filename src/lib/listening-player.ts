/**
 * 听力朗读：播放队列状态机 + 按性别挑系统音色（纯 TS，不依赖 React / Expo）。
 *
 * - 朗读本身通过注入的 SpeechDriver 完成（features 层传入 src/platform/speech 的封装，单测传 mock）。
 * - 「暂停」= 停掉当前这一条并记住位置，「继续」从这一条开头重念。
 *   Android 的系统 TTS 不支持真正的 pause / resume，这样两端行为一致。
 * - 每次开始念一条都换一个 token；stop 之后系统回调（onDone / onError）带的是旧 token，一律忽略，
 *   所以快速连点暂停、重听、从头都不会串条。
 */
import type { SpeakerGender, SpeechItem } from './exam/listening';

// ---------- 音色 ----------

/** 系统音色（字段同 expo-speech 的 Voice） */
export interface VoiceInfo {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

/** 念某个性别时用的参数：voice 为空表示用系统默认音色 */
export interface VoiceProfile {
  voice?: string;
  language: string;
  pitch: number;
}

export interface VoicePlan {
  female: VoiceProfile;
  male: VoiceProfile;
  /** 男女是不是两个真正不同的音色（false 表示同一音色靠音调区分） */
  distinct: boolean;
}

/** 降级时用音调区分男女 */
export const FALLBACK_PITCH: Readonly<Record<SpeakerGender, number>> = { female: 1.15, male: 0.85 };

const FEMALE_NAMES = [
  'female',
  'woman',
  'samantha',
  'karen',
  'victoria',
  'zira',
  'susan',
  'serena',
  'moira',
  'tessa',
  'fiona',
  'allison',
  'ava',
  'kate',
  'kathy',
  'vicki',
  'aria',
  'jenny',
  'libby',
  'sonia',
  'hazel',
  'emma',
  'joanna',
  'salli',
  'kimberly',
  'amy',
  'nicky',
  'stephanie',
];
const MALE_NAMES = [
  'male',
  'man',
  'daniel',
  'alex',
  'fred',
  'david',
  'mark',
  'guy',
  'arthur',
  'tom',
  'oliver',
  'aaron',
  'gordon',
  'rishi',
  'ryan',
  'george',
  'james',
  'matthew',
  'joey',
  'justin',
  'brian',
  'eric',
  'ralph',
  'bruce',
];
/** Android Google TTS 的音色代号（en-us-x-sfg-local 这种） */
const ANDROID_FEMALE = ['iob', 'iog', 'sfg', 'tpc', 'tpf', 'gba', 'gbc', 'gbg'];
const ANDROID_MALE = ['iol', 'iom', 'tpd', 'gbb', 'gbd', 'rjs'];

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** 从音色名字 / id 猜性别；猜不出返回 null */
export function guessVoiceGender(v: Pick<VoiceInfo, 'identifier' | 'name'>): SpeakerGender | null {
  const id = v.identifier.toLowerCase();
  // Android 的 "en-us-x-sfg#male_1-local"：# 后面写明了性别
  const tagged = /#(female|male)/.exec(id);
  if (tagged) return tagged[1] as SpeakerGender;
  const w = [...words(v.name), ...words(v.identifier)];
  // 先判 female：female 里包含 male
  if (w.some((x) => FEMALE_NAMES.includes(x) || ANDROID_FEMALE.includes(x))) return 'female';
  if (w.some((x) => MALE_NAMES.includes(x) || ANDROID_MALE.includes(x))) return 'male';
  return null;
}

/** en-US → 0，en-GB → 1，其它英语 → 2，非英语 → -1（不用） */
function languageRank(lang: string): number {
  const l = lang.replace('_', '-').toLowerCase();
  if (l.startsWith('en-us')) return 0;
  if (l.startsWith('en-gb')) return 1;
  if (l === 'en' || l.startsWith('en-')) return 2;
  return -1;
}

const normLang = (lang: string): string => {
  const [a, b] = lang.replace('_', '-').split('-');
  return b ? `${a!.toLowerCase()}-${b.toUpperCase()}` : a!.toLowerCase();
};

/**
 * 按性别挑音色：只用英语音色，en-US 优先、其次 en-GB，同语言里 Enhanced 优先。
 * 某个性别挑不到时降级：用另一个音色（或系统默认）并用音调区分男女。
 */
export function pickVoices(voices: readonly VoiceInfo[]): VoicePlan {
  const english = voices
    .map((v, i) => ({ v, i, rank: languageRank(v.language) }))
    .filter((x) => x.rank >= 0)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(b.v.quality === 'Enhanced') - Number(a.v.quality === 'Enhanced') ||
        a.i - b.i,
    )
    .map((x) => x.v);
  const find = (g: SpeakerGender) => english.find((v) => guessVoiceGender(v) === g);
  const f = find('female');
  const m = find('male');
  const profile = (v: VoiceInfo | undefined, pitch: number): VoiceProfile =>
    v
      ? { voice: v.identifier, language: normLang(v.language), pitch }
      : { language: 'en-US', pitch };
  if (f && m) return { female: profile(f, 1), male: profile(m, 1), distinct: true };
  // 只挑到一种：另一种用同一个音色、靠音调区分；一种都没有：用第一个英语音色（或系统默认）
  const base = f ?? m ?? english[0];
  return {
    female: profile(f ?? base, f ? 1 : FALLBACK_PITCH.female),
    male: profile(m ?? base, m ? 1 : FALLBACK_PITCH.male),
    distinct: false,
  };
}

// ---------- 播放队列 ----------

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface PlayerState {
  status: PlayerStatus;
  /** 当前（或下一条要念的）下标；done 时等于 items.length */
  index: number;
  /** single：逐句重听，只念这一条，念完回到 idle */
  mode: 'queue' | 'single';
  /** 每开始念一条加 1；系统回调带的 token 不是当前值就忽略 */
  token: number;
  /** 最近一次朗读出错的说明（中文）；开始念下一条时清空 */
  error: string | null;
}

export const INITIAL_PLAYER: PlayerState = {
  status: 'idle',
  index: 0,
  mode: 'queue',
  token: 0,
  error: null,
};

export type PlayerAction =
  /** 播放：idle / paused 从当前条开始；done 从头开始；playing 不变 */
  | { type: 'play' }
  | { type: 'pause' }
  /** 重听当前这一条（paused / done 也会开始念） */
  | { type: 'replay' }
  | { type: 'restart' }
  /** 逐句重听第 index 条 */
  | { type: 'playOne'; index: number }
  | { type: 'finished'; token: number }
  | { type: 'failed'; token: number; message: string }
  /** 停下并回到开头（交卷、再做一遍） */
  | { type: 'reset' };

const speakAt = (s: PlayerState, index: number, mode: PlayerState['mode']): PlayerState => ({
  status: 'playing',
  index,
  mode,
  token: s.token + 1,
  error: null,
});

/** 纯 reducer；length = 当前队列长度（念题开关会改变它） */
export function playerReducer(s: PlayerState, a: PlayerAction, length: number): PlayerState {
  const clamp = (i: number) => Math.max(0, Math.min(i, length));
  switch (a.type) {
    case 'play':
      if (length === 0 || s.status === 'playing') return s;
      if (s.status === 'done' || s.index >= length) return speakAt(s, 0, 'queue');
      return speakAt(s, clamp(s.index), 'queue');
    case 'pause':
      return s.status === 'playing' ? { ...s, status: 'paused' } : s;
    case 'replay': {
      if (length === 0) return s;
      const i = s.index >= length ? length - 1 : clamp(s.index);
      return speakAt(s, i, s.status === 'playing' ? s.mode : 'queue');
    }
    case 'restart':
      return length === 0 ? s : speakAt(s, 0, 'queue');
    case 'playOne':
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= length) return s;
      return speakAt(s, a.index, 'single');
    case 'finished': {
      if (a.token !== s.token || s.status !== 'playing') return s;
      if (s.mode === 'single') return { ...s, status: 'idle' };
      const next = s.index + 1;
      return next >= length
        ? { ...s, status: 'done', index: length }
        : { ...s, index: next, token: s.token + 1 };
    }
    case 'failed':
      if (a.token !== s.token || s.status !== 'playing') return s;
      return { ...s, status: 'paused', error: a.message };
    case 'reset':
      return { ...INITIAL_PLAYER, token: s.token + 1 };
  }
}

/** 朗读驱动：features 层用 src/platform/speech 实现，单测用 mock */
export interface SpeechDriver {
  speak(
    text: string,
    options: VoiceProfile & { rate: number },
    callbacks: { onDone: () => void; onError: (message: string) => void },
  ): void;
  stop(): void;
}

export interface PlayerSnapshot extends PlayerState {
  items: readonly SpeechItem[];
  rate: number;
  /** 正在念（或暂停在）的那一条；idle / done 为 null */
  current: SpeechItem | null;
}

export interface SpeechPlayer {
  getSnapshot(): PlayerSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(action: PlayerAction): void;
  /** 换队列（念题开关）：当前位置超出新队列时停下并标为念完 */
  setItems(items: readonly SpeechItem[]): void;
  /** 改语速：正在念时从这一条开头按新语速重念 */
  setRate(rate: number): void;
  setVoices(plan: VoicePlan): void;
  /** 离开页面：停下并回到开头（之后的系统回调都带旧 token，会被忽略） */
  stop(): void;
}

export const DEFAULT_VOICE_PLAN: VoicePlan = {
  female: { language: 'en-US', pitch: FALLBACK_PITCH.female },
  male: { language: 'en-US', pitch: FALLBACK_PITCH.male },
  distinct: false,
};

export function createSpeechPlayer(
  driver: SpeechDriver,
  init: { items: readonly SpeechItem[]; rate?: number; voices?: VoicePlan },
): SpeechPlayer {
  let items = init.items;
  let rate = init.rate ?? 1;
  let voices = init.voices ?? DEFAULT_VOICE_PLAN;
  let state = INITIAL_PLAYER;
  let snapshot: PlayerSnapshot = snap();
  const listeners = new Set<() => void>();

  function snap(): PlayerSnapshot {
    const active = state.status === 'playing' || state.status === 'paused';
    return { ...state, items, rate, current: active ? (items[state.index] ?? null) : null };
  }

  function speakCurrent(): void {
    const item = items[state.index];
    if (!item) return;
    const token = state.token;
    driver.speak(
      item.text,
      { ...voices[item.gender], rate },
      {
        onDone: () => dispatch({ type: 'finished', token }),
        onError: (message) => dispatch({ type: 'failed', token, message }),
      },
    );
  }

  /** natural：上一条是自己念完的（不用再 stop） */
  function commit(next: PlayerState, natural = false): void {
    const prev = state;
    if (next === prev) return;
    state = next;
    const wasPlaying = prev.status === 'playing';
    const tokenChanged = next.token !== prev.token;
    // 打断正在念的那一条：暂停、重听、从头、换语速、交卷
    if (wasPlaying && !natural && (tokenChanged || next.status !== 'playing')) driver.stop();
    if (next.status === 'playing' && tokenChanged) speakCurrent();
    snapshot = snap();
    for (const l of listeners) l();
  }

  function dispatch(action: PlayerAction): void {
    commit(playerReducer(state, action, items.length), action.type === 'finished');
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    dispatch,
    setItems(next) {
      if (next === items) return;
      items = next;
      if (
        state.index >= items.length &&
        (state.status === 'playing' || state.status === 'paused')
      ) {
        if (state.status === 'playing') driver.stop();
        state = { ...state, status: 'done', index: items.length, token: state.token + 1 };
      }
      snapshot = snap();
      for (const l of listeners) l();
    },
    setRate(r) {
      if (r === rate) return;
      rate = r;
      if (state.status === 'playing') commit({ ...state, token: state.token + 1 });
      else {
        snapshot = snap();
        for (const l of listeners) l();
      }
    },
    setVoices(plan) {
      voices = plan;
    },
    stop() {
      dispatch({ type: 'reset' });
      driver.stop();
    },
  };
}
