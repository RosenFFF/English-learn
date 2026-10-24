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
  void Promise.resolve(Speech.stop()).catch(() => undefined);
}

/** 系统音色（同 expo-speech 的 Voice） */
export interface SystemVoice {
  identifier: string;
  name: string;
  language: string;
  quality: string;
}

/**
 * 系统音色列表。网页端浏览器没有音色时 getAvailableVoicesAsync 会一直等 voiceschanged，
 * 所以加超时；取不到、报错都返回空数组（调用方降级为系统默认音色 + 音调区分）。
 */
export async function listVoices(timeoutMs = 1500): Promise<SystemVoice[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const voices = await Promise.race([
      Speech.getAvailableVoicesAsync(),
      new Promise<never[]>((resolve) => {
        timer = setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
    return voices.map((v) => ({
      identifier: v.identifier,
      name: v.name,
      language: v.language,
      quality: String(v.quality),
    }));
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface UtteranceOptions {
  language: string;
  rate: number;
  pitch: number;
  /** 音色 identifier；不传用系统默认 */
  voice?: string;
}

/** 念一句，念完 / 出错回调。被 stopSpeech 打断时部分平台也会回调，调用方要自己忽略过期的回调 */
export function speakUtterance(
  text: string,
  options: UtteranceOptions,
  callbacks: { onDone: () => void; onError: (message: string) => void },
): void {
  try {
    Speech.speak(text, {
      language: options.language,
      rate: options.rate,
      pitch: options.pitch,
      ...(options.voice ? { voice: options.voice } : {}),
      onDone: callbacks.onDone,
      onError: (e: Error) => callbacks.onError(e?.message || '系统朗读出错'),
    });
  } catch (e) {
    callbacks.onError(e instanceof Error ? e.message : String(e));
  }
}
