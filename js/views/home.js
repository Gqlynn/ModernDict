/**
 * 首页：#/
 * 极简版式：居中书名 + 中央检索 + 留白分隔的检字表、随手翻翻、附录与封底引言。
 * 视觉参考 DeepSeek 官网的克制与留白，不放大色块、不做卡片堆叠。
 */
import { api, isAbortError } from '../api.js';
import { annotateAbbreviations } from '../abbr.js';
import { getUser } from '../auth.js';
import {
  bindSearchBox,
  buildLetters,
  clearError,
  inlineErrorHTML,
  searchFormHTML,
  showError,
  visibleLetters,
} from '../components.js';
import { escapeHtml, qs, stripMarkdown, truncate } from '../utils.js';

const CHINESE_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const DEFAULT_QUOTE = {
  text: '对于某些事情，如果我们不尽快把它记录下来，也许在不久之后，就再也想不起来了。',
  source: '《整型溢出》',
};

const RANDOM_COUNT = 6;

function chineseNumber(value) {
  const index = Number(value) - 1;
  return CHINESE_NUMBERS[index] || String(value);
}

function letterRowHTML(letters) {
  const items = (letters || []).map((letter) => {
    const western = letter.section === 'western';
    const href = western
      ? '#/browse?section=western'
      : `#/browse?letter=${encodeURIComponent(letter.key)}`;
    const title = western ? '西文与数字开头的词条' : `按 ${letter.label} 检字`;
    return `<a class="hp-letter${western ? ' hp-letter--western' : ''}" href="${href}" title="${escapeHtml(
      title
    )}">${escapeHtml(letter.label)}</a>`;
  });
  return `<nav class="hp-letters" aria-label="首字母检字表">${items.join('')}</nav>`;
}

function entryRowHTML(entry) {
  const letter = entry.section === 'western' ? '西文' : String(entry.letter || '');
  return `<li class="hp-entry">
    <a href="#/entry/${encodeURIComponent(entry.id)}">
      <span class="hp-entry-letter">${escapeHtml(letter)}</span>
      <span class="hp-entry-head">${escapeHtml(entry.headword || '')}</span>
      <span class="hp-entry-def">${annotateAbbreviations(
        truncate(stripMarkdown(entry.definition || ''), 70)
      )}</span>
    </a>
  </li>`;
}

function appendixRowHTML(article, index) {
  const number = article.subtitle || `附录${chineseNumber(index + 1)}`;
  return `<li class="hp-appendix">
    <a href="#/article/${encodeURIComponent(article.id)}">
      <span class="hp-appendix-no">${escapeHtml(number)}</span>
      <span class="hp-appendix-title">${escapeHtml(article.title || '未命名附录')}</span>
      <span class="hp-appendix-desc">${escapeHtml(
        truncate(stripMarkdown(article.excerpt || ''), 44)
      )}</span>
    </a>
  </li>`;
}

function loadingHTML() {
  return `<section class="hp hp-loading" aria-busy="true" aria-label="正在加载首页">
    <div class="sk-line sk-line--title"></div>
    <div class="sk-line sk-line--sub"></div>
    <div class="sk-field"></div>
  </section>`;
}

export default {
  async render(ctx) {
    ctx.setTitle('首页');
    clearError();
    ctx.mount.innerHTML = loadingHTML();

    const randomPromise = Promise.allSettled(
      Array.from({ length: RANDOM_COUNT }, () => api.randomEntry(ctx.signal))
    ).then((results) =>
      results
        .filter((result) => result.status === 'fulfilled' && result.value && result.value.entry)
        .map((result) => result.value.entry)
    );

    const [metaResult, appendixResult, randomResult] = await Promise.allSettled([
      api.meta(ctx.signal),
      api.articles({ category: 'appendix', page_size: 20, sort: 'order' }, ctx.signal),
      randomPromise,
    ]);
    if (ctx.signal.aborted) return;
    const failuresOf = [metaResult, appendixResult, randomResult].filter(
      (result) => result.status === 'rejected'
    );
    if (failuresOf.some((result) => isAbortError(result.reason))) return;

    const meta = metaResult.status === 'fulfilled' ? metaResult.value || {} : {};
    const book = meta.book || {};
    const stats = meta.stats || {};
    const letters = buildLetters(meta.letters);
    const appendix = appendixResult.status === 'fulfilled' ? appendixResult.value : null;
    const randomEntries = randomResult.status === 'fulfilled' ? randomResult.value : [];

    const entryCount = stats.entries !== undefined ? stats.entries : '—';
    const articleCount = stats.articles !== undefined ? stats.articles : '—';
    const period = book.period || '2021.1–2023.6';
    const quote = book.quote && book.quote.text ? book.quote : DEFAULT_QUOTE;
    const quoteSource = (book.quote && book.quote.source) || DEFAULT_QUOTE.source;

    const appendixItems =
      appendix && Array.isArray(appendix.items) ? appendix.items.slice(0, 7) : [];
    const appendixHTML = appendix && Array.isArray(appendix.items)
      ? appendixItems.map(appendixRowHTML).join('') ||
        '<li class="hp-empty">附录尚在整理中。</li>'
      : `<li class="hp-empty">${inlineErrorHTML('附录列表加载失败。')}</li>`;

    const randomHTML = randomEntries.length
      ? randomEntries.map(entryRowHTML).join('')
      : `<li class="hp-empty">${inlineErrorHTML('随机词条加载失败。')}</li>`;

    ctx.mount.innerHTML = `
      <section class="hp">
        <header class="hp-hero">
          <h1 class="hp-title" id="home-title">现代梗语词典</h1>
          <p class="hp-welcome">欢迎，${escapeHtml((getUser() || {}).name || '')}</p>
          <div class="hp-search">
            ${searchFormHTML({
              variant: 'hero',
              placeholder: '搜索词条、释义或文章…',
            })}
          </div>
        </header>

        <section class="hp-block" aria-labelledby="hp-letters-title">
          <div class="hp-block-head">
            <h2 class="hp-block-title" id="hp-letters-title">检字表</h2>
            <a class="hp-block-link" href="#/browse">全部词条 <span aria-hidden="true">→</span></a>
          </div>
          ${letterRowHTML(visibleLetters(letters))}
        </section>

        <section class="hp-block" aria-labelledby="hp-random-title">
          <div class="hp-block-head">
            <h2 class="hp-block-title" id="hp-random-title">随手翻翻</h2>
          </div>
          <ul class="hp-entry-list">${randomHTML}</ul>
        </section>

        <section class="hp-block" aria-labelledby="hp-appendix-title">
          <div class="hp-block-head">
            <h2 class="hp-block-title" id="hp-appendix-title">附录</h2>
            <a class="hp-block-link" href="#/articles">全部文集 <span aria-hidden="true">→</span></a>
          </div>
          <ul class="hp-appendix-list">${appendixHTML}</ul>
        </section>

        <section class="hp-quote" aria-label="封底引言">
          <blockquote>
            <p>${escapeHtml(quote.text || DEFAULT_QUOTE.text)}</p>
            <cite>${escapeHtml(quoteSource)}</cite>
          </blockquote>
          <p class="hp-quote-meta">${escapeHtml(period)} · ${escapeHtml(
            book.backnote || '胜采公园巡游者'
          )}</p>
        </section>
      </section>
    `;

    const searchForm = qs('[data-search-form]', ctx.mount);
    if (searchForm) {
      bindSearchBox(searchForm, {
        onSubmit(keyword) {
          window.location.hash = `#/search?q=${encodeURIComponent(keyword)}`;
        },
      });
    }

    ctx.mount.querySelectorAll('[data-inline-retry]').forEach((button) => {
      button.addEventListener('click', () => ctx.refresh());
    });

    if (metaResult.status === 'rejected') {
      showError('词典元信息加载失败，统计数字可能不完整。', () => ctx.refresh());
    } else if (appendixResult.status === 'rejected') {
      showError('附录列表加载失败。', () => ctx.refresh());
    }
  },
};
