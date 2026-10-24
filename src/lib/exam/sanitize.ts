/**
 * 文本清洗（纯 TS，不依赖 zod）：
 * - cleanText：大模型返回的点评文字进库前用，去控制字符、规整空白、按字符数截断；
 * - promptText：任何要拼进 prompt 的文字（学生作答、题目内容）用，在 cleanText 的基础上把
 *   prompt 里用作分隔的标签（<answer> 等）中和掉，防止作答「闭合标签」后冒充指令。
 * 长度一律按 Unicode 码点算（Array.from），不会把代理对切成半个字。
 */

/** 控制字符、格式字符和行/段分隔符；换行和制表符单独处理 */
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
/** 截断时追加的标记 */
export const TRUNCATION_MARK = '…';

export interface CleanTextOptions {
  /** 最多保留多少个字符（码点），超出部分截掉并追加 TRUNCATION_MARK */
  max: number;
  /** 是否保留换行（多行文字最多保留连续两个换行）；默认 true */
  multiline?: boolean;
}

/** 按码点截断；超出时末尾换成 TRUNCATION_MARK，总长度不超过 max */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  if (max <= 0) return '';
  return (
    chars
      .slice(0, max - 1)
      .join('')
      .trimEnd() + TRUNCATION_MARK
  );
}

/**
 * 清洗一段文字：
 * 1. \r\n、\r 统一成 \n，制表符换成空格；
 * 2. 去掉控制字符、零宽等格式字符、U+2028/2029（multiline 为 false 时换行也换成空格）；
 * 3. 每行去行尾空白、行内连续空格合并，连续空行最多保留一个，去首尾空白；
 * 4. 按 max 截断。
 * 非字符串返回空串。
 */
export function cleanText(input: unknown, opts: CleanTextOptions): string {
  if (typeof input !== 'string') return '';
  const multiline = opts.multiline ?? true;
  let s = input.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  s = s.replace(FORBIDDEN, (ch) => (ch === '\n' && multiline ? '\n' : ch === '\n' ? ' ' : ''));
  s = s
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncate(s, opts.max);
}

/** prompt 里用作分隔的标签名；出现在被嵌入的文字里时一律中和 */
export const PROMPT_TAGS = ['answer', 'source', 'reference', 'title', 'directions'] as const;
const TAG_PATTERN = new RegExp(`<\\s*(/?)\\s*(${PROMPT_TAGS.join('|')})\\b[^>]*>`, 'giu');

/**
 * 要拼进 prompt 的文字：先 cleanText，再把 <answer>、</answer> 等分隔标签换成
 * 全角书名号形式（‹answer› / ‹/answer›），模型仍能看懂原意，但无法提前闭合标签。
 */
export function promptText(input: unknown, max: number): string {
  return cleanText(input, { max }).replace(
    TAG_PATTERN,
    (_m, slash: string, name: string) => `‹${slash}${name.toLowerCase()}›`,
  );
}
