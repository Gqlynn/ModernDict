/**
 * 搜索结果：#/search?q=
 * 词条与文章分组展示、关键词 <mark> 高亮、空结果提示、输入联想。
 */
import { api, isAbortError } from '../api.js';
import {
  bindSearchBox,
  buildLetters,
  categoryLabel,
  clearError,
  entryLetterLabel,
  inlineErrorHTML,
  letterGridHTML,
  safeSnippetHTML,
  searchFormHTML,
  showError,
  skeletonHTML,
  visibleLetters,
} from '../components.js';
import { annotateAbbreviationsInHtml } from '../abbr.js';
import { escapeHtml, highlightText, qs } from '../utils.js';

function resultEntryHTML(entry, keyword) {
  const letter = entryLetterLabel(entry);
  const snippet = safeSnippetHTML(entry.snippet, entry.definition, keyword);
  return `<li class="result-item">
    <a class="result-link" href="#/entry/${encodeURIComponent(entry.id)}">
      <span class="result-badge">${escapeHtml(letter)}</span>
      <span class="result-body">
        <span class="result-title">${highlightText(entry.headword || '', keyword)}</span>
        <span class="result-snippet">${annotateAbbreviationsInHtml(snippet)}</span>
      </span>
      <span class="result-arrow" aria-hidden="true">→</span>
    </a>
  </li>`;
}

function resultArticleHTML(article, keyword, categories) {
  const label = categoryLabel(categories, article.category);
  const subtitle = article.subtitle ? `<span class="result-subtitle">${escapeHtml(article.subtitle)}</span>` : '';
  const snippet = safeSnippetHTML(article.snippet, article.excerpt, keyword);
  return `<li class="result-item">
    <a class="result-link" href="#/article/${encodeURIComponent(article.id)}">
      <span class="result-badge result-badge--article">${escapeHtml(label)}</span>
      <span class="result-body">
        <span class="result-title">${highlightText(article.title || '', keyword)}${subtitle}</span>
        <span class="result-snippet">${snippet}</span>
      </span>
      <span class="result-arrow" aria-hidden="true">→</span>
    </a>
  </li>`;
}

function groupHTML({ id, title, count, itemsHTML }) {
  if (!itemsHTML) return '';
  return `<section class="result-group" aria-labelledby="${id}">
    <div class="result-group-head">
      <h2 class="result-group-title" id="${id}">${escapeHtml(title)}</h2>
      <span class="result-group-count">${count} 条</span>
    </div>
    <ul class="result-list">${itemsHTML}</ul>
  </section>`;
}

export default {
  async render(ctx) {
    clearError();
    const keyword = String(ctx.query.q || '').trim();
    const categories = [
      { key: 'front', label: '卷首' },
      { key: 'appendix', label: '附录' },
      { key: 'afterword', label: '后记' },
      { key: 'archive', label: '版本档案' },
    ];

    if (!keyword) {
      ctx.setTitle('搜索');
      ctx.mount.innerHTML = skeletonHTML('list', 4);
      let meta = null;
      try {
        meta = await api.meta(ctx.signal);
      } catch (error) {
        if (isAbortError(error)) return;
      }
      if (ctx.signal.aborted) return;
      const letters = buildLetters(meta && meta.letters);
      ctx.mount.innerHTML = `<section class="search-page search-page--idle" aria-labelledby="search-title">
        <header class="search-page-head">
          <p class="eyebrow">检 索</p>
          <h1 class="search-page-title" id="search-title">翻检全书</h1>
          <div class="search-page-form">
            ${searchFormHTML({ variant: 'page', placeholder: '索 引 · 输入词条、释义或文章…' })}
          </div>
        </header>
        <section class="search-idle-block" aria-labelledby="search-letters-title">
          <div class="section-head">
            <h2 class="section-title" id="search-letters-title">按字母翻阅</h2>
            <a class="section-more" href="#/browse">词典正文 →</a>
          </div>
          ${letterGridHTML(visibleLetters(letters))}
        </section>
      </section>`;
      const form = qs('[data-search-form]', ctx.mount);
      bindSearchBox(form, {
        onSubmit(value) {
          ctx.navigate(`/search?q=${encodeURIComponent(value)}`);
        },
      });
      return;
    }

    ctx.setTitle(`搜索：${keyword}`);
    ctx.mount.innerHTML = skeletonHTML('list', 6);

    let response;
    try {
      response = await api.search(keyword, { limit: 50, signal: ctx.signal });
    } catch (error) {
      if (isAbortError(error)) return;
      ctx.mount.innerHTML = `<section class="search-page" aria-labelledby="search-title">
        <header class="search-page-head">
          <p class="eyebrow">检 索</p>
          <h1 class="search-page-title" id="search-title">检索「${escapeHtml(keyword)}」</h1>
          <div class="search-page-form">
            ${searchFormHTML({ value: keyword, variant: 'page', placeholder: '索 引 · 输入词条、释义或文章…' })}
          </div>
        </header>
        ${inlineErrorHTML('检索失败，请检查网络或稍后重试。')}
      </section>`;
      const form = qs('[data-search-form]', ctx.mount);
      bindSearchBox(form, {
        onSubmit(value) {
          ctx.navigate(`/search?q=${encodeURIComponent(value)}`);
        },
      });
      const retry = qs('[data-inline-retry]', ctx.mount);
      if (retry) retry.addEventListener('click', () => ctx.refresh());
      showError(error.message || '检索失败，请稍后重试。', () => ctx.refresh());
      return;
    }
    if (ctx.signal.aborted) return;

    const entries = response && Array.isArray(response.entries) ? response.entries : [];
    const articles = response && Array.isArray(response.articles) ? response.articles : [];
    const total =
      response && response.total !== undefined ? response.total : entries.length + articles.length;
    const entriesTotal =
      response && response.entries_total !== undefined ? response.entries_total : entries.length;
    const articlesTotal =
      response && response.articles_total !== undefined ? response.articles_total : articles.length;

    const entriesHTML = entries.map((entry) => resultEntryHTML(entry, keyword)).join('');
    const articlesHTML = articles.map((article) => resultArticleHTML(article, keyword, categories)).join('');

    const resultsHTML =
      entries.length + articles.length === 0
        ? `<div class="search-empty">
            <p class="search-empty-title">未收此语</p>
            <p class="search-empty-message">全书未找到与「${escapeHtml(
              keyword
            )}」相关的词条或文章。</p>
            <div class="search-empty-actions">
              <a class="btn btn-secondary" href="#/browse">翻阅词典正文</a>
            </div>
          </div>`
        : `${groupHTML({
            id: 'search-entries',
            title: '词条',
            count: entriesTotal,
            itemsHTML: entriesHTML,
          })}
          ${groupHTML({
            id: 'search-articles',
            title: '文章',
            count: articlesTotal,
            itemsHTML: articlesHTML,
          })}`;

    ctx.mount.innerHTML = `<section class="search-page" aria-labelledby="search-title">
      <header class="search-page-head">
        <p class="eyebrow">检 索</p>
        <h1 class="search-page-title" id="search-title">检索「${escapeHtml(keyword)}」</h1>
        <p class="search-summary">全书共找到 ${escapeHtml(String(total))} 处相关记载${
          entries.length + articles.length > 0
            ? `：词条 ${entriesTotal} 条，文章 ${articlesTotal} 篇`
            : ''
        }。</p>
        <div class="search-page-form">
          ${searchFormHTML({ value: keyword, variant: 'page', placeholder: '索 引 · 输入词条、释义或文章…' })}
        </div>
      </header>
      ${resultsHTML}
    </section>`;

    const form = qs('[data-search-form]', ctx.mount);
    bindSearchBox(form, {
      onSubmit(value) {
        ctx.navigate(`/search?q=${encodeURIComponent(value)}`);
      },
    });
  },
};
