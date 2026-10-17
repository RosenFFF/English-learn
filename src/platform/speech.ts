/** 平台层：系统 TTS（expo-speech）的薄封装。业务代码只通过这里朗读，不直接依赖原生模块。 */
import * as Speech from 'expo-speech';

export interface SpeakOptions {
  language: string;
  rate: number;
}

export function speak(text: string, options: SpeakOptions): void {
  Speech.speak(text, options);
}

export function stopSpeech(): void {
  Speech.stop();
}
