import { formatPhonetic, parseMeanings, parsePairs } from './words';

describe('words.db JSON 解析', () => {
  it('正常解析', () => {
    expect(parseMeanings('[{"pos":"v","zh":"放弃"}]')).toEqual([{ pos: 'v', zh: '放弃' }]);
    expect(parsePairs('[{"en":"with abandon","zh":"恣意地"}]')).toEqual([
      { en: 'with abandon', zh: '恣意地' },
    ]);
  });
  it('坏数据不崩溃：返回空或跳过坏项', () => {
    expect(parseMeanings('not json')).toEqual([]);
    expect(parseMeanings(null)).toEqual([]);
    expect(parsePairs('{"en":"x"}')).toEqual([]);
    expect(parsePairs('[{"zh":"无英文"},{"en":"ok","zh":""}, 3]')).toEqual([{ en: 'ok', zh: '' }]);
  });
  it('音标统一加斜杠', () => {
    expect(formatPhonetic("ə'bænd(ə)n")).toBe("/ə'bænd(ə)n/");
    expect(formatPhonetic('/eɪ/')).toBe('/eɪ/');
    expect(formatPhonetic('')).toBeNull();
  });
});
