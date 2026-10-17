import * as Speech from 'expo-speech';

import { getAutoSpeak } from '../settings/service';

export { getAutoSpeak };

/** 朗读单词（美音）。连续点击时先停掉上一次。 */
export function speakWord(text: string): void {
  Speech.stop();
  Speech.speak(text, { language: 'en-US', rate: 0.9 });
}

export function stopSpeaking(): void {
  Speech.stop();
}
