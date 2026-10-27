/**
 * 关于本书：#/about
 * 原书封面封底、书籍信息、题诗、卷首入口与封底引言。
 */
import { api, isAbortError } from '../api.js';
import {
  clearError,
  inlineErrorHTML,
  showError,
  skeletonHTML,
} from '../components.js';
import { escapeHtml, formatDate, qs } from '../utils.js';

function findArticle(articles, keyword) {
  if (!Array.isArray(articles)) return null;
  return articles.find((article) => String(article.title || '').includes(keyword)) || null;
}

function articleLink(articles, keyword) {
  const article = findArticle(articles, keyword);
  if (!article) return '';
  return `<a class="about-link" href="#/article/${encodeURIComponent(article.id)}">${escapeHtml(
    article.title
  )} →</a>`;
}

export default {
  async render(ctx) {
    clearError();
    ctx.setTitle('关于本书');
    ctx.mount.innerHTML = skeletonHTML('article');

    const [metaResult, frontResult] = await Promise.allSettled([
      api.meta(ctx.signal),
      api.articles({ category: 'front', page_size: 20, sort: 'order' }, ctx.signal),
    ]);
    if (ctx.signal.aborted) return;
    if (
      [metaResult, frontResult].some(
        (result) => result.status === 'rejected' && isAbortError(result.reason)
      )
    ) {
      return;
    }

    const meta = metaResult.status === 'fulfilled' ? metaResult.value || {} : {};
    const book = meta.book || {};
    const stats = meta.stats || {};
    const frontArticles =
      frontResult.status === 'fulfilled' && frontResult.value && Array.isArray(frontResult.value.items)
        ? frontResult.value.items
        : [];

    const entryCount = stats.entries !== undefined ? stats.entries : '—';
    const articleCount = stats.articles !== undefined ? stats.articles : '—';
    const period = book.period || '2021.1–2023.6';
    const quote = book.quote || {};
    const poem = Array.isArray(book.poem) ? book.poem.filter(Boolean) : [];
    const updateTime = stats.last_updated ? formatDate(stats.last_updated) : '';
    const prefaceAuthor = book.preface_author || '';
    const versionLabel = book.version_label || '2020级九班';
    const sealText = String(versionLabel).slice(-2) || '九班';

    const frontLinks = frontResult.status === 'fulfilled'
      ? `<div class="about-links">
          ${articleLink(frontArticles, '前言')}
          ${articleLink(frontArticles, '读者须知')}
          ${articleLink(frontArticles, '目录')}
          <a class="about-link" href="#/articles">全部文集 →</a>
        </div>`
      : inlineErrorHTML('卷首文章入口加载失败。');

    ctx.mount.innerHTML = `<div class="about-page">
      <header class="about-head">
        <p class="eyebrow">关于本书</p>
        <h1 class="about-title">一本班内词典的来历</h1>
      </header>

      <div class="about-grid">
        <section class="about-section paper-card" aria-labelledby="about-info-title">
          <h2 class="about-section-title" id="about-info-title">书籍信息</h2>
          <table class="about-table">
            <tbody>
              <tr><th scope="row">书名</th><td>${escapeHtml(book.title || '现代梗语词典')}</td></tr>
              <tr><th scope="row">版本</th><td>${escapeHtml(versionLabel)}</td></tr>
              <tr><th scope="row">编者</th><td>${escapeHtml(book.compiler || 'GYX')}</td></tr>
              <tr><th scope="row">时间跨度</th><td>${escapeHtml(period)}</td></tr>
              <tr><th scope="row">收录规模</th><td>${escapeHtml(
                String(entryCount)
              )} 条词条 · ${escapeHtml(String(articleCount))} 篇文章</td></tr>
              ${
                prefaceAuthor
                  ? `<tr><th scope="row">卷首</th><td>前言 · ${escapeHtml(prefaceAuthor)}</td></tr>`
                  : ''
              }
              ${
                updateTime
                  ? `<tr><th scope="row">网站更新</th><td>${escapeHtml(updateTime)}</td></tr>`
                  : ''
              }
            </tbody>
          </table>
        </section>

        ${
          poem.length
            ? `<section class="about-section about-poem-section paper-card" aria-labelledby="about-poem-title">
                <h2 class="about-section-title" id="about-poem-title">题 诗</h2>
                <blockquote class="about-poem">${poem
                  .map((line) => `<p>${escapeHtml(line)}</p>`)
                  .join('')}</blockquote>
                <div class="about-seal" aria-hidden="true">${escapeHtml(sealText)}</div>
              </section>`
            : ''
        }
      </div>

      ${frontLinks}

      ${
        quote.text
          ? `<section class="about-quote" aria-label="封底引言">
              <blockquote>
                <p>${escapeHtml(quote.text)}</p>
                <cite>${escapeHtml(quote.source || '《整型溢出》')}</cite>
              </blockquote>
            </section>`
          : ''
      }
    </div>`;

    ctx.mount.querySelectorAll('[data-inline-retry]').forEach((button) => {
      button.addEventListener('click', () => ctx.refresh());
    });

    if (metaResult.status === 'rejected') {
      showError('书籍信息加载失败，部分内容可能不完整。', () => ctx.refresh());
    }
  },
};
