/**
 * 文章列表：#/articles
 * 按分类分组展示（卷首 / 附录 / 后记 / 版本档案），卡片含编号、标题、副题、摘要、字数。
 */
import { api, isAbortError } from '../api.js';
import {
  categoryLabel,
  clearError,
  emptyStateHTML,
  inlineErrorHTML,
  showError,
  skeletonHTML,
} from '../components.js';
import { escapeHtml, qs, truncate, scrollElementIntoView, stripMarkdown } from '../utils.js';

const FALLBACK_CATEGORY_ORDER = [
  { key: 'front', label: '卷首' },
  { key: 'appendix', label: '附录' },
  { key: 'afterword', label: '后记' },
  { key: 'archive', label: '版本档案' },
];

function articleCardHTML(article, index, categories) {
  const subtitle = article.subtitle || `${categoryLabel(categories, article.category)}${index + 1}`;
  const wordCount = article.word_count ? `约 ${article.word_count} 字` : '';
  return `<a class="article-card" href="#/article/${encodeURIComponent(article.id)}">
    <span class="article-card-no">${escapeHtml(subtitle)}</span>
    <h3 class="article-card-title">${escapeHtml(article.title || '未命名文章')}</h3>
    <p class="article-card-excerpt">${escapeHtml(truncate(stripMarkdown(article.excerpt || ''), 96))}</p>
    <span class="article-card-foot">
      <span class="article-card-author">${escapeHtml(article.author || 'GYX')}</span>
      ${wordCount ? `<span class="article-card-words">${escapeHtml(wordCount)}</span>` : ''}
      <span class="article-card-more">阅读全文 →</span>
    </span>
  </a>`;
}

export default {
  async render(ctx) {
    clearError();
    ctx.setTitle('附录与文集');
    ctx.mount.innerHTML = skeletonHTML('list', 6);

    const [metaResult, articlesResult] = await Promise.allSettled([
      api.meta(ctx.signal),
      api.articles({ page_size: 100, sort: 'order' }, ctx.signal),
    ]);
    if (ctx.signal.aborted) return;
    if (
      [metaResult, articlesResult].some(
        (result) => result.status === 'rejected' && isAbortError(result.reason)
      )
    ) {
      return;
    }

    const meta = metaResult.status === 'fulfilled' ? metaResult.value || {} : {};
    const categories =
      Array.isArray(meta.categories) && meta.categories.length
        ? meta.categories
        : FALLBACK_CATEGORY_ORDER;
    const articlesResponse = articlesResult.status === 'fulfilled' ? articlesResult.value : null;
    const articles =
      articlesResponse && Array.isArray(articlesResponse.items) ? articlesResponse.items : [];

    const groups = categories
      .map((category) => ({
        category,
        articles: articles.filter((article) => article.category === category.key),
      }))
      .filter((group) => group.articles.length > 0);

    const total = articles.length;
    const categoryNavHTML = groups.length
      ? `<nav class="category-nav" aria-label="文章分类">
          ${groups
            .map(
              (group) =>
                `<button type="button" class="category-nav-item" data-target="group-${escapeHtml(
                  group.category.key
                )}">${escapeHtml(group.category.label)}<span class="category-nav-count">${
                  group.articles.length
                }</span></button>`
            )
            .join('')}
        </nav>`
      : '';

    const bodyHTML = articlesResult.status === 'rejected'
      ? inlineErrorHTML('文章列表加载失败，请稍后重试。')
      : groups.length === 0
        ? emptyStateHTML({
            title: '文集尚在整理',
            message: '目前还没有收录文章。',
            actions: '<a class="btn btn-primary btn-small" href="#/new-article">新增文章</a>',
          })
        : groups
            .map(
              (group) => `<section class="article-group" id="group-${escapeHtml(
                group.category.key
              )}" aria-labelledby="group-title-${escapeHtml(group.category.key)}">
                <div class="article-group-head">
                  <h2 class="article-group-title" id="group-title-${escapeHtml(
                    group.category.key
                  )}">${escapeHtml(group.category.label)}</h2>
                  <span class="article-group-count">${group.articles.length} 篇</span>
                </div>
                <div class="article-grid">
                  ${group.articles
                    .map((article, index) => articleCardHTML(article, index, categories))
                    .join('')}
                </div>
              </section>`
            )
            .join('');

    ctx.mount.innerHTML = `<div class="articles-page">
      <header class="collection-head">
        <p class="eyebrow">附录 · 后记 · 卷首</p>
        <h1 class="collection-title">文集与附录</h1>
        ${categoryNavHTML}
        <p class="collection-count">共 ${total} 篇${meta.stats && meta.stats.articles ? ` · 全书 ${meta.stats.articles} 篇` : ''}</p>
      </header>
      ${bodyHTML}
    </div>`;

    ctx.mount.querySelectorAll('[data-inline-retry]').forEach((button) => {
      button.addEventListener('click', () => ctx.refresh());
    });

    ctx.mount.querySelectorAll('.category-nav-item[data-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.target);
        scrollElementIntoView(target);
      });
    });

    if (articlesResult.status === 'rejected') {
      showError(articlesResult.reason.message || '文章列表加载失败。', () => ctx.refresh());
    }
  },
};
