/**
 * 通用工具函数：转义、日期、文本截断、防抖、高亮等。
 * 所有用户数据在拼接 HTML 前必须经过 escapeHtml。
 */

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** 转义文本，供插入 HTML 文本节点与属性值使用。 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/** 查询单个元素。 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/** 查询多个元素，返回真数组。 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** 把 HTML 字符串变成单个 DOM 元素（取第一个元素节点）。 */
export function fromHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html).trim();
  return template.content.firstElementChild;
}

/** 空值安全的文本修剪。 */
export function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 防抖。 */
export function debounce(fn, wait = 250) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** 解析日期；无效返回 null。 */
function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 2026年2月3日 */
export function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 2026年2月3日 12:00 */
export function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)} ${hours}:${minutes}`;
}

/** 相对时间：今天 / 昨天 / 3 天前 / 2026年2月3日 */
export function relativeTime(value) {
  const date = parseDate(value);
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff >= 0 && diff < 60 * 1000) return '刚刚';
  if (diff >= 0 && diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  if (diff >= 0 && diff < day) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
  if (diff >= 0 && diff < 2 * day) return '昨天';
  if (diff >= 0 && diff < 8 * day) return `${Math.floor(diff / day)} 天前`;
  return formatDate(date);
}

/** 截断纯文本，按字符计。 */
export function truncate(text, max = 120) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/** 去掉 Markdown 标记，得到纯文本摘要。 */
export function stripMarkdown(source) {
  return String(source || '')
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+[.、])\s*/gm, '')
    .replace(/^\s*[\s|:-]*-{2,}[\s|:-]*$/gm, ' ')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/[|*_~#]/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** 中文正文字数：不计空白。 */
export function countChars(text) {
  return String(text || '').replace(/\s+/g, '').length;
}

/** 标签输入解析：支持中文逗号、顿号、分号与空格分隔。 */
export function splitTags(value) {
  return String(value || '')
    .split(/[,，、;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/;

/** 判断字符是否是中日韩文字或全角标点。 */
export function isCjkChar(char) {
  return !!char && CJK_RE.test(char);
}

/** 合并同一段落内的折行：中文之间不插空格，西文之间补空格。 */
export function joinParagraphLines(lines) {
  const result = [];
  lines.forEach((line, index) => {
    const text = String(line || '').trim();
    if (!text) return;
    if (index === 0 || result.length === 0) {
      result.push(text);
      return;
    }
    const prev = result[result.length - 1];
    const prevChar = prev[prev.length - 1];
    const nextChar = text[0];
    if (isCjkChar(prevChar) && isCjkChar(nextChar)) {
      result[result.length - 1] = prev + text;
    } else {
      result[result.length - 1] = `${prev} ${text}`;
    }
  });
  return result.join('');
}

/** 在已转义的纯文本上高亮关键词（返回 HTML 字符串，调用方保证安全）。 */
export function highlightPlain(text, query) {
  const source = escapeHtml(text);
  const keyword = String(query || '').trim();
  if (!keyword) return source;
  const escapedKeyword = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKeyword})`, 'gi');
  return source.replace(regex, '<mark>$1</mark>');
}

/** 用关键词高亮纯文本并转义（内部先转义再高亮）。 */
export function highlightText(text, query) {
  return highlightPlain(text, query);
}

/** 设置页面标题。 */
export function setPageTitle(title) {
  const suffix = '现代梗语词典';
  document.title = title ? `${title} · ${suffix}` : suffix;
}

/** 平滑回到顶部。 */
export function scrollPageToTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  } catch (error) {
    window.scrollTo(0, 0);
  }
}

/** 元素滚动到视口内（用于目录锚点）。 */
export function scrollElementIntoView(element) {
  if (!element) return;
  const headerOffset = 96;
  const top = element.getBoundingClientRect().top + window.scrollY - headerOffset;
  window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

/** 简单的 id 防冲突前缀。 */
export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
