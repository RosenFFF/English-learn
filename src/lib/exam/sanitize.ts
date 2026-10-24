/**
 * 文本清洗（纯 TS，不依赖 zod）：
 * - cleanText：大模型返回的点评文字进库前用，去控制字符、规整空白、按字符数截断；
 * - promptText：任何要拼进 prompt 的文字（学生作答、题目内容）用，在 cleanText 的基础上把
 *   prompt 里用作分隔的标签（<answer> 等）中和掉，防止作答「闭合标签」后冒充指令；
 * - plainStem：题干（阅读、听力）给界面显示的纯文本，去掉 Markdown 和多余空白；
 * - cleanSpeechText：给 TTS 朗读的文字，在 plainStem 的基础上再去掉舞台说明、emoji 等。
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

/** HTML 标签（含 <speak> 之类的 SSML） */
const HTML_TAG = /<[^>]{0,200}>/g;
/** 像标签的 <b>、</p>、<br/>（字母开头）；显示用，不会误删 "a < b > c" 这样的比较 */
const HTML_ELEMENT = /<\/?[A-Za-z][^<>\n]{0,200}>/g;

// ---------- Markdown → 纯文本 ----------
/** 行首标记：标题 #、引用 >、列表符号（- * + • 和 1. 1)）、分隔线 */
const MD_HEADING = /^ {0,3}#{1,6}(?:\s+|$)/;
const MD_HEADING_CLOSE = /\s+#+\s*$/;
const MD_QUOTE = /^ {0,3}(?:>\s?)+/;
const MD_LIST = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+/;
const MD_RULE = /^\s*(?:[-*_]\s*){3,}$/;
/** 图片 ![alt](url) 留 alt；链接 [文字](url)、[文字][ref] 留文字；<https://…> 留网址 */
const MD_IMAGE = /!\[([^\]\n]*)\]\([^)\n]*\)/g;
const MD_LINK = /\[([^\]\n]+)\]\([^)\n]*\)/g;
const MD_REF_LINK = /\[([^\]\n]+)\]\[[^\]\n]*\]/g;
const MD_AUTOLINK = /<((?:https?:\/\/|mailto:)[^>\s]+)>/gi;
/** 行内强调：`代码`、**加粗** / __加粗__、*斜体* / _斜体_、~~删除线~~（标记要成对、紧贴文字） */
const MD_CODE = /(`+)([^`\n]*?[^`\s][^`\n]*?)\1/g;
const MD_STRONG_STAR = /\*\*(?![\s*])([^\n]*?[^\s*])\*\*/g;
const MD_STRONG_UNDERSCORE = /(^|[^\p{L}\p{N}_])__(?![\s_])([^\n]*?[^\s_])__(?![\p{L}\p{N}_])/gu;
const MD_EM_STAR = /\*(?=[^\s*])([^*\n]*?[^\s*])\*/g;
/** _斜体_ 只认词边界上的下划线：snake_case、填空线 ____ 不动 */
const MD_EM_UNDERSCORE = /(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu;
const MD_STRIKE = /~~(?=\S)([^\n]*?\S)~~/g;
/** 成对规则没吃掉的残留标记：反引号、连续的 * 和 ~ */
const MD_LEFTOVER = /`+|\*{2,}|~{2,}/g;

function stripMarkdownLine(line: string): string {
  if (MD_RULE.test(line)) return '';
  const s = line.replace(MD_QUOTE, '');
  if (MD_HEADING.test(s)) return s.replace(MD_HEADING, '').replace(MD_HEADING_CLOSE, '');
  return s.replace(MD_LIST, '');
}

/**
 * 题干给界面显示用的纯文本（阅读、听力题干都适用；纯函数，不改存库内容）：
 * 1. cleanText 规整换行和控制字符；
 * 2. 去掉行首的标题 #、引用 >、列表符号和分隔线；
 * 3. 链接、图片留文字，去掉 HTML 标签，去掉 `代码`、**加粗**、_斜体_、~~删除线~~ 的标记；
 * 4. 所有空白合并成一个空格，标点前的空格去掉，去首尾空白。
 * 正常的标点、撇号（don't、’s）、括号、snake_case 和填空线 ____ 原样保留。非字符串返回空串。
 */
export function plainStem(input: unknown): string {
  return cleanText(input, { max: Number.MAX_SAFE_INTEGER })
    .split('\n')
    .map(stripMarkdownLine)
    .join('\n')
    .replace(MD_IMAGE, '$1')
    .replace(MD_LINK, '$1')
    .replace(MD_REF_LINK, '$1')
    .replace(MD_AUTOLINK, '$1')
    .replace(HTML_ELEMENT, ' ')
    .replace(MD_CODE, '$2')
    .replace(MD_STRONG_STAR, '$1')
    .replace(MD_STRONG_UNDERSCORE, '$1$2')
    .replace(MD_EM_STAR, '$1')
    .replace(MD_EM_UNDERSCORE, '$1$2')
    .replace(MD_STRIKE, '$1')
    .replace(MD_LEFTOVER, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

// ---------- 朗读 ----------
/** 舞台说明、残留的 Markdown 符号、emoji 等不适合 TTS 朗读的内容 */
const STAGE_DIRECTION =
  /\[[^\]\n]{0,80}\]|\((?:pause|laughs?|laughing|sighs?|music|applause|inaudible|coughs?)[^)\n]{0,40}\)/giu;
const MARKDOWN_MARKS = /[*_#`~|]+/g;
const PICTOGRAPHIC =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\uFE0F)+/gu;

/**
 * 给 TTS 朗读的文字：先 plainStem（去 Markdown、HTML 标签，链接留文字，合并空白），
 * 再去掉 [舞台说明] 和 (pause) 之类的括注、残留的 Markdown 符号、emoji，最后合并空白。
 * 不截断（稿子长度由 schema 校验，超长算不合格，不能悄悄截掉影响答案）。
 */
export function cleanSpeechText(input: unknown): string {
  return plainStem(input)
    .replace(HTML_TAG, ' ')
    .replace(STAGE_DIRECTION, ' ')
    .replace(MARKDOWN_MARKS, ' ')
    .replace(PICTOGRAPHIC, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 去掉模型误加在开头的说话人前缀，如 "W: Hi" → "Hi"、"Professor Lee: Today…" → "Today…"。
 * 只认传入的称呼 / id（不区分大小写），不会误删 "Remember: …" 这类正常句子。
 */
export function stripSpeakerPrefix(text: string, labels: readonly string[]): string {
  const names = labels.map((l) => l.trim()).filter(Boolean);
  if (names.length === 0) return text;
  const re = new RegExp(`^(?:${names.map(escapeRe).join('|')})\\s*[:：]\\s*`, 'iu');
  return text.replace(re, '').trim();
}
