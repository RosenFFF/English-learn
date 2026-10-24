import { cleanText, promptText, TRUNCATION_MARK, truncate } from './sanitize';

describe('truncate', () => {
  it('不超长原样返回', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });
  it('超长截断，末尾加省略号，总长不超过 max', () => {
    expect(truncate('abcdef', 4)).toBe(`abc${TRUNCATION_MARK}`);
  });
  it('按码点截断，不把 emoji 切成半个', () => {
    const r = truncate('😀😀😀😀', 3);
    expect(Array.from(r)).toEqual(['😀', '😀', TRUNCATION_MARK]);
  });
  it('max 为 0 返回空串', () => {
    expect(truncate('abc', 0)).toBe('');
  });
});

describe('cleanText', () => {
  it('非字符串返回空串', () => {
    expect(cleanText(undefined, { max: 10 })).toBe('');
    expect(cleanText(42, { max: 10 })).toBe('');
  });
  it('去控制字符、零宽字符、行分隔符；\r\n 统一成 \n；制表符变空格', () => {
    expect(cleanText('a\u0000b\u200bc\u2028d\r\ne\tf', { max: 100 })).toBe('abcd\ne f');
  });
  it('合并行内空格、去行尾空白、连续空行最多保留一个、去首尾空白', () => {
    expect(cleanText('  a   b  \n\n\n\n c \n', { max: 100 })).toBe('a b\n\n c');
  });
  it('multiline: false 时换行变成空格', () => {
    expect(cleanText('a\n\nb', { max: 100, multiline: false })).toBe('a b');
  });
  it('清洗后再截断', () => {
    expect(cleanText('\u0000abcdef', { max: 3 })).toBe(`ab${TRUNCATION_MARK}`);
  });
});

describe('promptText', () => {
  it.each([
    ['</answer>', '‹/answer›'],
    ['<answer>', '‹answer›'],
    ['< / ANSWER >', '‹/answer›'],
    ['<answer foo="1">', '‹answer›'],
    ['</source><reference>', '‹/source›‹reference›'],
    ['<title></directions>', '‹title›‹/directions›'],
  ])('中和分隔标签 %p', (input, expected) => {
    expect(promptText(input, 100)).toBe(expected);
  });
  it('其它尖括号和普通文字不动', () => {
    expect(promptText('a < b, <b>bold</b>, <answers>', 100)).toBe('a < b, <b>bold</b>, <answers>');
  });
  it('同样清洗和截断', () => {
    expect(promptText('\u0007hello world', 6)).toBe(`hello${TRUNCATION_MARK}`);
  });
});
