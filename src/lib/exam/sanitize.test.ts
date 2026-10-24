import {
  cleanSpeechText,
  cleanText,
  plainStem,
  promptText,
  stripSpeakerPrefix,
  TRUNCATION_MARK,
  truncate,
} from './sanitize';

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

describe('plainStem', () => {
  it.each([
    ['What is the **main** idea?', 'What is the main idea?'],
    ['What is the __main__ idea?', 'What is the main idea?'],
    ['Why does the _man_ look *tired*?', 'Why does the man look tired?'],
    ['What does `npm ci` do?', 'What does npm ci do?'],
    ['What does ``a `tick` b`` mean?', 'What does a tick b mean?'],
    ['See [the report](https://example.com/r?a=1) for details.', 'See the report for details.'],
    ['See [the report][1] and <https://example.com>.', 'See the report and https://example.com.'],
    ['![a chart](chart.png) What does it show?', 'a chart What does it show?'],
    ['## What is the passage mainly about? ##', 'What is the passage mainly about?'],
    [
      '# Title\n\n- first point\n* second point\n+ third\n1. Which one?',
      'Title first point second point third Which one?',
    ],
    ['> Quoted line\n> more', 'Quoted line more'],
    ['---\nWhat next?', 'What next?'],
    ['~~Wrong~~ Right?', 'Wrong Right?'],
    ['  What   is\t\tit \n\n\n about ?  ', 'What is it about?'],
    ['<b>Bold</b> stem<br/>here.', 'Bold stem here.'],
  ])('%p → %p', (input, expected) => {
    expect(plainStem(input)).toBe(expected);
  });

  it('保留正常的标点、撇号、括号、数字和填空线', () => {
    for (const s of [
      "Why didn't the woman's plan work?",
      'What’s the speaker’s main point (in paragraph 2)?',
      'Fill in: the ____ was "quite" good; 5 * 3 = 15, right?',
      'Which is true: a < b, or b > c?',
      'Use snake_case and file_name_2 here.',
      'It costs $5.50 — about 30% less!',
      '#1 and C# are fine; so is item #3.',
      '2010 was a good year.',
    ])
      expect(plainStem(s)).toBe(s);
  });

  it('非字符串返回空串；全是标记返回空串', () => {
    expect(plainStem(undefined)).toBe('');
    expect(plainStem(42)).toBe('');
    expect(plainStem('** ** `` ~~')).toBe('');
  });
});

describe('cleanSpeechText', () => {
  it.each([
    ['Hello\u0000 world\u200b!', 'Hello world!'],
    ['[laughs] Well, (pause) okay.', 'Well, okay.'],
    ['**Really?** `yes` # done', 'Really? yes done'],
    ['<speak>Hi</speak> there 😀👍🏽 .', 'Hi there.'],
    ['line one\nline two', 'line one line two'],
    ['It costs (about) $5.', 'It costs (about) $5.'],
    ['See [the report](https://x.y/z) now.', 'See the report now.'],
    ['## Question\n- Why _not_?', 'Question Why not?'],
    ["Don't [pause] stop.", "Don't stop."],
  ])('%p → %p', (input, expected) => {
    expect(cleanSpeechText(input)).toBe(expected);
  });
  it('非字符串返回空串', () => {
    expect(cleanSpeechText(null)).toBe('');
  });
});

describe('stripSpeakerPrefix', () => {
  it('去掉传入的称呼 / id 前缀（不区分大小写，中英文冒号）', () => {
    expect(stripSpeakerPrefix('W: Hi.', ['W', 'Woman'])).toBe('Hi.');
    expect(stripSpeakerPrefix('woman：Hi.', ['W', 'Woman'])).toBe('Hi.');
    expect(stripSpeakerPrefix('Professor Lee: Today…', ['L', 'Professor Lee'])).toBe('Today…');
  });
  it('别的冒号句子不动；称呼里的正则字符被转义', () => {
    expect(stripSpeakerPrefix('Remember: this.', ['W'])).toBe('Remember: this.');
    expect(stripSpeakerPrefix('Dr. A: x', ['Dr. A'])).toBe('x');
    expect(stripSpeakerPrefix('DrXA: x', ['Dr. A'])).toBe('DrXA: x');
    expect(stripSpeakerPrefix('W: x', [])).toBe('W: x');
  });
});
