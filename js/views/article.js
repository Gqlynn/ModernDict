/**
 * 文章详情：#/article/:id
 * Markdown 子集渲染、首字下沉、侧栏目录、上下篇导航、编辑入口。
 */
import { api, ApiError, isAbortError } from '../api.js';
import {
  categoryLabel,
  clearError,
  showError,
  skeletonHTML,
} from '../components.js';
import { renderMarkdown } from '../markdown.js';
import {
  countChars,
  escapeHtml,
  formatDateTime,
  qs,
  qsa,
  scrollElementIntoView,
  scrollPageToTop,
} from '../utils.js';

function pagerHTML(prev, next) {
  return `<nav class="article-pager" aria-label="上下篇">
    ${
      prev
        ? `<a class="article-pager-item" href="#/article/${encodeURIComponent(prev.id)}">
            <span class="article-pager-label">← 上一篇</span>
            <span class="article-pager-title">${escapeHtml(prev.title || '')}</span>
          </a>`
        : '<span class="article-pager-item article-pager-item--disabled"><span class="article-pager-label">← 上一篇</span><span class="article-pager-title">已至文集首页</span></span>'
    }
    ${
      next
        ? `<a class="article-pager-item article-pager-item--next" href="#/article/${encodeURIComponent(next.id)}">
            <span class="article-pager-label">下一篇 →</span>
            <span class="article-pager-title">${escapeHtml(next.title || '')}</span>
          </a>`
        : '<span class="article-pager-item article-pager-item--next article-pager-item--disabled"><span class="article-pager-label">下一篇 →</span><span class="article-pager-title">已至文集末页</span></span>'
    }
  </nav>`;
}

const CJK_IDEOGRAPH = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/;

/**
 * 首字下沉：仅当文章首段首字为汉字时启用；
 * 以标点、书名号等开头时不放大，避免「《现」这类怪相。
 */
function applyDropCap(body) {
  if (!body) return;
  const firstParagraph = body.firstElementChild;
  if (!firstParagraph || firstParagraph.tagName !== 'P') return;
  const walker = document.createTreeWalker(firstParagraph, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue || '';
    const index = text.search(/\S/);
    if (index >= 0) {
      const char = text.charAt(index);
      if (!CJK_IDEOGRAPH.test(char) || node.parentElement !== firstParagraph) return;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const span = document.createElement('span');
      span.className = 'drop-cap';
      range.surroundContents(span);
      firstParagraph.classList.add('has-dropcap');
      return;
    }
    node = walker.nextNode();
  }
}

function tocHTML(toc) {  if (!Array.isArray(toc) || toc.length === 0) return '';
  return `<nav class="article-toc" aria-label="本文目录">
    <p class="toc-label">目 次</p>
    <ul class="toc-list">
      ${toc
        .map(
          (item) =>
            `<li class="toc-item toc-item--level-${Math.min(item.level, 4)}">
              <button type="button" class="toc-link" data-target="${escapeHtml(item.anchor)}">${escapeHtml(
                item.text
              )}</button>
            </li>`
        )
        .join('')}
    </ul>
  </nav>`;
}

export default {
  async render(ctx) {
    clearError();
    ctx.mount.innerHTML = skeletonHTML('article');

    let data;
    try {
      data = await api.article(ctx.params.id, ctx.signal);
    } catch (error) {
      if (isAbortError(error)) return;
      const notFound = error instanceof ApiError && error.status === 404;
      ctx.setTitle(notFound ? '此篇未收录' : '文章加载失败');
      ctx.mount.innerHTML = `<section class="entry-error" role="alert">
        <p class="entry-error-kicker">${notFound ? '未收此篇' : '连接中断'}</p>
        <h1 class="entry-error-title">${notFound ? '此篇未收录' : '文章暂时打不开'}</h1>
        <p class="entry-error-message">${escapeHtml(
          notFound ? '文集中查不到这篇文章，它或许尚未收入。' : error.message
        )}</p>
        <div class="entry-error-actions">
          ${
            notFound
              ? '<a class="btn btn-primary" href="#/articles">浏览文集</a>'
              : '<button type="button" class="btn btn-primary" data-retry>重试</button>'
          }
          <a class="btn btn-secondary" href="#/articles">返回文章列表</a>
        </div>
      </section>`;
      const retry = qs('[data-retry]', ctx.mount);
      if (retry) retry.addEventListener('click', () => ctx.refresh());
      if (!notFound) showError(error.message, () => ctx.refresh());
      return;
    }
    if (ctx.signal.aborted) return;

    const article = (data && data.article) || {};
    const prev = data ? data.prev : null;
    const next = data ? data.next : null;
    const category = categoryLabel([], article.category);
    const rendered = renderMarkdown(article.content || '');
    const wordCount = article.word_count || countChars(article.content || '');
    const updated = formatDateTime(article.updated_at || article.created_at);
    ctx.setTitle(article.title || '文章');

    ctx.mount.innerHTML = `<div class="article-page">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a>
        <span class="breadcrumb-sep" aria-hidden="true">/</span>
        <a href="#/articles">文集</a>
        <span class="breadcrumb-sep" aria-hidden="true">/</span>
        <span class="breadcrumb-current" aria-current="page">${escapeHtml(article.title || '')}</span>
      </nav>

      <div class="article-layout${rendered.toc.length ? '' : ' article-layout--no-toc'}">
        <article class="article-sheet paper-card">
          <header class="article-head">
            <p class="article-category"><span class="category-tag">${escapeHtml(category)}</span></p>
            <h1 class="article-title">${escapeHtml(article.title || '')}</h1>
            ${article.subtitle ? `<p class="article-subtitle">${escapeHtml(article.subtitle)}</p>` : ''}
            <p class="article-meta">
              <span>${escapeHtml(article.author || 'GYX')}</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>约 ${escapeHtml(String(wordCount))} 字</span>
              <span class="meta-sep" aria-hidden="true">·</span>
              <span>更新于 ${escapeHtml(updated)}</span>
              <a class="article-edit-link" href="#/edit-article/${encodeURIComponent(article.id)}">编辑本文</a>
            </p>
            <div class="article-head-rule" aria-hidden="true"></div>
          </header>
          <div class="article-body" data-article-body>${rendered.html}</div>
        </article>
        <aside class="article-aside">
          ${tocHTML(rendered.toc)}
        </aside>
      </div>

      ${pagerHTML(prev, next)}
      <p class="article-backtop"><button type="button" class="btn btn-ghost btn-small" data-backtop>↑ 回到顶部</button></p>
    </div>`;

    const body = qs('[data-article-body]', ctx.mount);
    applyDropCap(body);
    const tocNav = qs('.article-toc', ctx.mount);
    const tocLinks = qsa('.toc-link', tocNav || ctx.mount);
    tocLinks.forEach((link) => {
      link.addEventListener('click', () => {
        const target = document.getElementById(link.dataset.target);
        if (target) scrollElementIntoView(target);
      });
    });

    const backtop = qs('[data-backtop]', ctx.mount);
    if (backtop) backtop.addEventListener('click', () => scrollPageToTop());

    // 阅读进度：滚动时高亮当前小节。
    if (tocNav && body) {
      const headings = qsa('h2, h3, h4', body);
      const linkMap = new Map(tocLinks.map((link) => [link.dataset.target, link]));
      let ticking = false;
      const updateSpy = () => {
        ticking = false;
        if (!document.body.contains(body)) return;
        let activeId = '';
        headings.forEach((heading) => {
          const rect = heading.getBoundingClientRect();
          if (rect.top <= 140) activeId = heading.id;
        });
        if (!activeId && headings.length > 0) activeId = headings[0].id;
        tocLinks.forEach((link) => {
          link.classList.toggle('is-active', link.dataset.target === activeId);
        });
        const activeLink = linkMap.get(activeId);
        if (activeLink) {
          activeLink.setAttribute('aria-current', 'true');
        } else {
          tocLinks.forEach((link) => link.removeAttribute('aria-current'));
        }
      };
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateSpy);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      ctx.signal.addEventListener('abort', () => {
        window.removeEventListener('scroll', onScroll);
      });
      updateSpy();
    }
  },
};
