/**
 * 静态部署版 API（构建时生成为站点里的 js/api.js）。
 *
 * 本地版的后端是 Python + SQLite（serve.py）；GitHub Pages 只能托管静态文件，
 * 因此这里用「构建时快照 + 浏览器端逻辑」复刻同一套接口：
 *   - 读取、检索、分页：在浏览器内完成，行为与 server/db.py 对齐；
 *   - 姓名 + 学号验证：只保存 SHA-256 哈希，校验通过后把会话存进 localStorage；
 *   - 增删改（编纂台）：只读，统一抛出 405，提示到本机编纂台修改后重新部署。
 *
 * 数据来自同目录的 static-data.js（由 tools/build_static.py 生成，勿手改）。
 */
import { DATA } from './static-data.js';

const SESSION_KEY = 'mcd_session_token';
const SESSION_DAYS = 30;
const CLASS_LABELS = { 9: '2020级九班', 8: '前2020级八班' };
const CLASS_PATHS = { 9: '/', 8: '/8/' };

export class ApiError extends Error {
  constructor(message, { status = 0, fields = null, payload = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields && typeof fields === 'object' ? fields : null;
    this.payload = payload;
  }
}

export function isAbortError(error) {
  return !!error && (error.name === 'AbortError' || error.code === 20);
}

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function ensureAlive(signal) {
  if (signal && signal.aborted) throw abortError();
}

function toInt(value, fallback, minimum, maximum) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function versionInfo(cls) {
  const value = Number(cls) === 8 ? 8 : 9;
  return { class: value, label: CLASS_LABELS[value], path: CLASS_PATHS[value] };
}

/* ------------------------------------------------------------------ auth */

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, '');
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

/** 纯前端 SHA-256（十六进制），用于比对「姓名|学号」哈希，避免公开名单原文。 */
function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const paddedLength = ((((bytes.length + 9) + 63) >> 6) << 6);
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(w[i - 15], 7) ^ rotateRight(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotateRight(w[i - 2], 17) ^ rotateRight(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
}

function readToken() {
  try {
    return window.localStorage.getItem(SESSION_KEY) || '';
  } catch (error) {
    return '';
  }
}

function writeToken(token) {
  try {
    if (token) window.localStorage.setItem(SESSION_KEY, token);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    /* localStorage 不可用时仅当次会话有效 */
  }
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(text) {
  try {
    const base = String(text).replace(/-/g, '+').replace(/_/g, '/');
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch (error) {
    return '';
  }
}

function currentUser() {
  const token = readToken();
  if (!token) return null;
  let payload = null;
  try {
    payload = JSON.parse(decodeBase64Url(token) || 'null');
  } catch (error) {
    payload = null;
  }
  if (!payload || !payload.n || !payload.i) {
    writeToken('');
    return null;
  }
  const issuedAt = Number(payload.i);
  if (!Number.isFinite(issuedAt) || Date.now() / 1000 - issuedAt > SESSION_DAYS * 86400) {
    writeToken('');
    return null;
  }
  return { name: String(payload.n), class: Number(payload.c) === 8 ? 8 : 9 };
}

const USER_FIELDS = ['name', 'class'];

function publicUser(user) {
  const result = {};
  USER_FIELDS.forEach((key) => {
    result[key] = user[key];
  });
  return result;
}

/* --------------------------------------------------------------- helpers */

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** server/db.py 的 plain_text 前端等价实现（用于搜索与摘要）。 */
function plainText(markdown, limit) {
  let text = String(markdown || '');
  text = text.replace(/^#{1,6}\s*/gm, '');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/`(.+?)`/g, '$1');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  text = text.replace(/^\s*>\s?/gm, '');
  text = text.replace(/\|/g, ' ');
  text = text.replace(/^\s*-+\s*$/gm, '');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{2,}/g, '\n').trim();
  if (limit) return text.slice(0, limit);
  return text;
}

function wordCount(text) {
  return String(text || '').replace(/\s+/g, '').length;
}

function makeSnippet(text, keyword, width = 90) {
  const source = String(text || '').trim();
  if (!keyword) return escapeHtml(source.slice(0, width * 2));
  const index = source.toLowerCase().indexOf(String(keyword).toLowerCase());
  if (index < 0) return escapeHtml(source.slice(0, width * 2));
  const start = Math.max(0, index - Math.floor(width / 2));
  const end = Math.min(source.length, index + String(keyword).length + width);
  const windowText = source.slice(start, end);
  const escaped = escapeHtml(windowText);
  const pattern = new RegExp(escapeRegExp(escapeHtml(keyword)), 'gi');
  const marked = escaped.replace(pattern, (match) => `<mark>${match}</mark>`);
  return `${start > 0 ? '…' : ''}${marked}${end < source.length ? '…' : ''}`;
}

const ENTRIES = Array.isArray(DATA.entries) ? DATA.entries : [];
const ARTICLES = Array.isArray(DATA.articles) ? DATA.articles : [];
const ARTICLES_FULL = Array.isArray(DATA.articlesFull) ? DATA.articlesFull : [];
const AUTH_RECORDS = Array.isArray(DATA.auth) ? DATA.auth : [];
const ENTRY_BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));
const ARTICLE_BY_ID = new Map(ARTICLES_FULL.map((article) => [article.id, article]));
const ARTICLE_BY_SLUG = new Map(
  ARTICLES_FULL.filter((article) => article.slug).map((article) => [article.slug, article])
);

function compareText(a, b) {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function paginate(rows, page, pageSize) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: current,
    page_size: pageSize,
    pages,
  };
}

function readonlyError(action) {
  return new ApiError(`静态部署版为只读，无法${action}；请在本机编纂台修改后重新部署。`, {
    status: 405,
  });
}

function entryDetail(id) {
  const entry = ENTRY_BY_ID.get(Number(id));
  if (!entry) throw new ApiError('词条不存在', { status: 404 });

  let prev = null;
  let next = null;
  ENTRIES.forEach((row) => {
    if (row.sort_order < entry.sort_order) {
      if (!prev || row.sort_order > prev.sort_order || (row.sort_order === prev.sort_order && row.id > prev.id)) {
        prev = row;
      }
    }
    if (row.sort_order > entry.sort_order) {
      if (!next || row.sort_order < next.sort_order || (row.sort_order === next.sort_order && row.id < next.id)) {
        next = row;
      }
    }
  });

  const related = [];
  const seen = new Set([entry.id]);
  const refs = String(entry.definition || '').match(/【([^】]+)】/g) || [];
  refs.forEach((token) => {
    const name = token.slice(1, -1);
    const found = ENTRIES.find((row) => row.headword === name);
    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      related.push({ id: found.id, headword: found.headword });
    }
  });
  if (related.length < 4) {
    for (const row of ENTRIES) {
      if (related.length >= 4) break;
      if (row.letter === entry.letter && row.id !== entry.id && !seen.has(row.id)) {
        seen.add(row.id);
        related.push({ id: row.id, headword: row.headword });
      }
    }
  }

  return {
    entry,
    prev: prev ? { id: prev.id, headword: prev.headword } : null,
    next: next ? { id: next.id, headword: next.headword } : null,
    related,
  };
}

function articleDetail(ident) {
  const key = String(ident);
  let article = null;
  if (/^\d+$/.test(key)) article = ARTICLE_BY_ID.get(Number(key));
  if (!article) article = ARTICLE_BY_SLUG.get(key);
  if (!article) throw new ApiError('文章不存在', { status: 404 });

  let prev = null;
  let next = null;
  ARTICLES_FULL.forEach((row) => {
    if (row.sort_order < article.sort_order) {
      if (!prev || row.sort_order > prev.sort_order || (row.sort_order === prev.sort_order && row.id > prev.id)) {
        prev = row;
      }
    }
    if (row.sort_order > article.sort_order) {
      if (!next || row.sort_order < next.sort_order || (row.sort_order === next.sort_order && row.id < next.id)) {
        next = row;
      }
    }
  });

  const toc = [];
  String(article.content || '')
    .split('\n')
    .forEach((line) => {
      const match = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
      if (match) {
        toc.push({ level: match[1].length, text: match[2].trim(), anchor: `h-${toc.length + 1}` });
      }
    });

  return {
    article,
    prev: prev ? { id: prev.id, title: prev.title } : null,
    next: next ? { id: next.id, title: next.title } : null,
    toc,
  };
}

function searchAll(keyword, limit, includeArchive) {
  const result = { q: keyword, total: 0, entries: [], articles: [] };
  if (!keyword) return result;
  result.entries_total = 0;
  result.articles_total = 0;
  const lower = keyword.toLowerCase();

  const scoredEntries = [];
  ENTRIES.forEach((entry) => {
    const headword = String(entry.headword || '');
    const definition = String(entry.definition || '');
    const pinyin = String(entry.pinyin || '');
    const headLower = headword.toLowerCase();
    const definitionLower = definition.toLowerCase();
    let score = 0;
    if (headword === keyword) score = 100;
    else if (headLower.startsWith(lower)) score = 85;
    else if (headLower.includes(lower)) score = 70;
    else if (definitionLower.includes(lower)) score = 45;
    else if (pinyin && pinyin.toLowerCase().includes(lower)) score = 30;
    if (score) scoredEntries.push({ score, entry });
  });
  scoredEntries.sort(
    (left, right) =>
      right.score - left.score ||
      (left.entry.sort_order || 0) - (right.entry.sort_order || 0) ||
      left.entry.id - right.entry.id
  );
  result.entries = scoredEntries.slice(0, limit).map(({ score, entry }) => ({
    id: entry.id,
    headword: entry.headword,
    letter: entry.letter,
    section: entry.section,
    definition: entry.definition,
    snippet: makeSnippet(entry.definition, keyword),
    score,
  }));
  result.entries_total = scoredEntries.length;

  const scoredArticles = [];
  ARTICLES_FULL.forEach((article) => {
    if (!includeArchive && article.category === 'archive') return;
    const text = plainText(article.content);
    const title = String(article.title || '');
    const titleLower = title.toLowerCase();
    const textLower = text.toLowerCase();
    let score = 0;
    if (title === keyword) score = 95;
    else if (titleLower.startsWith(lower)) score = 80;
    else if (titleLower.includes(lower)) score = 65;
    else if (textLower.includes(lower)) score = 35;
    else if (plainText(article.content, 160).toLowerCase().includes(lower)) score = 30;
    if (score) scoredArticles.push({ score, article, text });
  });
  scoredArticles.sort(
    (left, right) =>
      right.score - left.score ||
      (left.article.sort_order || 0) - (right.article.sort_order || 0) ||
      left.article.id - right.article.id
  );
  result.articles = scoredArticles.slice(0, limit).map(({ score, article, text }) => ({
    id: article.id,
    title: article.title,
    category: article.category,
    subtitle: article.subtitle,
    snippet: makeSnippet(text, keyword),
    score,
  }));
  result.articles_total = scoredArticles.length;
  result.total = result.entries_total + result.articles_total;
  return result;
}

/* -------------------------------------------------------------------- api */

export const api = {
  /** 当前验证会话（从 localStorage 里的静态 token 恢复）。 */
  async session(signal) {
    ensureAlive(signal);
    const user = currentUser();
    if (!user) return { authenticated: false };
    return {
      authenticated: true,
      user: publicUser(user),
      welcome: `欢迎，${user.name}`,
      version: versionInfo(user.class),
    };
  },

  /** 姓名 + 学号验证：与构建时写入的哈希比对。 */
  async login(data, signal) {
    ensureAlive(signal);
    const payload = data || {};
    const name = normalizeName(payload.name);
    const studentId = String(payload.student_id || '').trim();
    if (!/^\d{8}$/.test(studentId)) {
      throw new ApiError('姓名与学号不匹配，请核对后重试。', {
        status: 401,
        fields: { student_id: '姓名与学号不匹配' },
      });
    }
    const digest = sha256Hex(`${name}|${studentId}`);
    const record = AUTH_RECORDS.find((item) => item && item.h === digest);
    if (!record) {
      throw new ApiError('姓名与学号不匹配，请核对后重试。', {
        status: 401,
        fields: { student_id: '姓名与学号不匹配' },
      });
    }
    const user = { name, class: Number(record.c) === 8 ? 8 : 9 };
    const token = encodeBase64Url(
      JSON.stringify({ n: user.name, c: user.class, i: Math.floor(Date.now() / 1000) })
    );
    writeToken(token);
    return {
      ok: true,
      user: publicUser(user),
      welcome: `欢迎，${user.name}`,
      version: versionInfo(user.class),
      token,
    };
  },

  /** 退出验证。 */
  async logout(signal) {
    ensureAlive(signal);
    writeToken('');
    return { ok: true };
  },

  async meta(signal) {
    ensureAlive(signal);
    return DATA.meta;
  },

  async letters(signal) {
    ensureAlive(signal);
    return { items: (DATA.meta && DATA.meta.letters) || [] };
  },

  async stats(signal) {
    ensureAlive(signal);
    return (DATA.meta && DATA.meta.stats) || {};
  },

  async abbreviations(signal) {
    ensureAlive(signal);
    return { items: DATA.abbreviations || [] };
  },

  async entries(params = {}, signal) {
    ensureAlive(signal);
    const letter = params.letter === undefined || params.letter === null ? '' : String(params.letter);
    const section = params.section === undefined || params.section === null ? '' : String(params.section);
    const keyword = params.q === undefined || params.q === null ? '' : String(params.q).trim();
    let rows = ENTRIES.slice();
    if (section === 'main' || section === 'western') {
      rows = rows.filter((entry) => entry.section === section);
    }
    if (letter) {
      if (letter === 'western' || letter === '西文' || letter === '西文开头单词及数字的解释') {
        rows = rows.filter((entry) => entry.section === 'western');
      } else {
        rows = rows.filter((entry) => entry.letter === letter);
      }
    }
    if (keyword) {
      const lower = keyword.toLowerCase();
      rows = rows.filter(
        (entry) =>
          String(entry.headword || '').toLowerCase().includes(lower) ||
          String(entry.definition || '').toLowerCase().includes(lower) ||
          String(entry.pinyin || '').toLowerCase().includes(lower)
      );
    }
    const sort = params.sort || 'order';
    if (sort === 'headword') {
      rows.sort((left, right) => compareText(left.headword, right.headword) || left.id - right.id);
    } else if (sort === 'updated') {
      rows.sort(
        (left, right) =>
          compareText(right.updated_at, left.updated_at) || right.id - left.id
      );
    } else {
      rows.sort(
        (left, right) =>
          (left.sort_order || 0) - (right.sort_order || 0) || left.id - right.id
      );
    }
    const page = toInt(params.page, 1, 1, 100000);
    const pageSize = toInt(params.page_size, 100, 1, 500);
    return paginate(rows, page, pageSize);
  },

  async entry(id, signal) {
    ensureAlive(signal);
    const key = String(id);
    if (!/^\d+$/.test(key)) throw new ApiError('词条不存在', { status: 404 });
    return entryDetail(key);
  },

  async randomEntry(signal) {
    ensureAlive(signal);
    if (!ENTRIES.length) throw new ApiError('词典中还没有词条', { status: 404 });
    const index = Math.floor(Math.random() * ENTRIES.length);
    return { entry: ENTRIES[index] };
  },

  async deleteEntry(id, signal) {
    ensureAlive(signal);
    throw readonlyError('删除词条');
  },

  async articles(params = {}, signal) {
    ensureAlive(signal);
    const category = params.category ? String(params.category) : '';
    const keyword = params.q ? String(params.q).trim() : '';
    let rows = ARTICLES.slice();
    if (category) rows = rows.filter((article) => article.category === category);
    if (keyword) {
      const lower = keyword.toLowerCase();
      rows = rows.filter((article) => {
        const full = ARTICLE_BY_ID.get(article.id);
        return (
          String(article.title || '').toLowerCase().includes(lower) ||
          String((full && full.content) || '').toLowerCase().includes(lower)
        );
      });
    }
    const sort = params.sort || 'order';
    if (sort === 'updated') {
      rows.sort(
        (left, right) =>
          compareText(right.updated_at, left.updated_at) || right.id - left.id
      );
    } else {
      rows.sort(
        (left, right) =>
          (left.sort_order || 0) - (right.sort_order || 0) || left.id - right.id
      );
    }
    const page = toInt(params.page, 1, 1, 100000);
    const pageSize = toInt(params.page_size, 50, 1, 200);
    return paginate(rows, page, pageSize);
  },

  async article(idOrSlug, signal) {
    ensureAlive(signal);
    return articleDetail(idOrSlug);
  },

  async createArticle(data, signal) {
    ensureAlive(signal);
    throw readonlyError('新增文章');
  },

  async updateArticle(id, data, signal) {
    ensureAlive(signal);
    throw readonlyError('修改文章');
  },

  async deleteArticle(id, signal) {
    ensureAlive(signal);
    throw readonlyError('删除文章');
  },

  async search(q, { limit = 20, includeArchive = false, signal } = {}) {
    ensureAlive(signal);
    const keyword = String(q || '').trim();
    return searchAll(keyword, toInt(limit, 20, 1, 100), Boolean(includeArchive));
  },

  async suggest(q, { signal } = {}) {
    ensureAlive(signal);
    const keyword = String(q || '').trim();
    if (!keyword) return { items: [] };
    const lower = keyword.toLowerCase();
    const entries = ENTRIES.filter((entry) =>
      String(entry.headword || '').toLowerCase().includes(lower)
    )
      .sort(
        (left, right) =>
          String(left.headword).length - String(right.headword).length ||
          compareText(left.headword, right.headword)
      )
      .slice(0, 8)
      .map((entry) => ({
        type: 'entry',
        id: entry.id,
        text: entry.headword,
        extra: entry.letter,
      }));
    const articles = ARTICLES.filter((article) =>
      String(article.title || '').toLowerCase().includes(lower)
    )
      .sort(
        (left, right) =>
          String(left.title).length - String(right.title).length || left.id - right.id
      )
      .slice(0, 8)
      .map((article) => ({
        type: 'article',
        id: article.id,
        text: article.title,
        extra: article.subtitle || '',
      }));
    return { items: entries.concat(articles).slice(0, 8) };
  },

  async exportAll(signal) {
    ensureAlive(signal);
    return {
      book: (DATA.meta && DATA.meta.book) || {},
      entries: ENTRIES,
      articles: ARTICLES_FULL,
    };
  },
};

/** 供调试用（不参与页面逻辑）。 */
export const STATIC_INFO = {
  generatedAt: DATA.generatedAt || '',
  version: DATA.version,
  entries: ENTRIES.length,
  articles: ARTICLES.length,
  entryDetail,
  articleDetail,
  wordCount,
  plainText,
};
