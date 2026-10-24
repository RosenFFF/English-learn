/**
 * 朗读面板的文字：状态行（playerStatusText）和念题时显示的题干（playerCaption，用 displayText）。
 */
import { DEMO_LONG_CONVERSATION } from '../../lib/exam/__testutils__/listening-fixtures';
import { playerCaption, playerStatusText } from './PlayerPanel';
import { newSpeechPlayer, toSpeechQueue, type SpeechPlayer } from './service';

jest.mock('../../platform/speech', () => ({
  listVoices: jest.fn(async () => []),
  speakUtterance: jest.fn(),
  stopSpeech: jest.fn(),
  speak: jest.fn(),
}));

const n = DEMO_LONG_CONVERSATION.script.length;

function playerAt(payload: typeof DEMO_LONG_CONVERSATION, index: number): SpeechPlayer {
  const player = newSpeechPlayer({ items: toSpeechQueue(payload) });
  player.dispatch({ type: 'playOne', index });
  return player;
}

describe('playerStatusText / playerCaption', () => {
  it('还没开始：状态行报原文段数（不算念题），不显示题干', () => {
    const s = newSpeechPlayer({ items: toSpeechQueue(DEMO_LONG_CONVERSATION) }).getSnapshot();
    expect(playerStatusText(s)).toBe(`共 ${n} 段原文 · 点播放开始`);
    expect(playerCaption(s)).toBeNull();
  });

  it('念原文：状态行是段号和称呼，不显示题干', () => {
    const s = playerAt(DEMO_LONG_CONVERSATION, 1).getSnapshot();
    expect(playerStatusText(s)).toBe(`第 2/${n} 段 · Man`);
    expect(playerCaption(s)).toBeNull();
  });

  it('旁白念题：状态行是题号，题干用 displayText（不带 "Question n." 前缀）；暂停时保留', () => {
    const player = playerAt(DEMO_LONG_CONVERSATION, n + 2);
    expect(playerStatusText(player.getSnapshot())).toBe('念题 · 第 3 题');
    expect(playerCaption(player.getSnapshot())).toBe(DEMO_LONG_CONVERSATION.questions[2]!.stem);
    player.dispatch({ type: 'pause' });
    expect(playerStatusText(player.getSnapshot())).toBe('已暂停 · 念题 · 第 3 题');
    expect(playerCaption(player.getSnapshot())).toBe(DEMO_LONG_CONVERSATION.questions[2]!.stem);
    player.stop();
    expect(playerCaption(player.getSnapshot())).toBeNull();
  });

  it('题干里的 Markdown 不显示出来', () => {
    const payload = {
      ...DEMO_LONG_CONVERSATION,
      questions: DEMO_LONG_CONVERSATION.questions.map((q, i) =>
        i === 0 ? { ...q, stem: '## What does the man *mainly* worry about?' } : q,
      ),
    };
    const s = playerAt(payload, n).getSnapshot();
    expect(playerCaption(s)).toBe('What does the man mainly worry about?');
  });
});
