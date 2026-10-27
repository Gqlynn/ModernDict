/**
 * 编纂台：#/admin
 * 新增文章 / 词条管理（只读与删除）、最近修订、文章管理（编辑与删除）。
 */
import { api, isAbortError } from '../api.js';
import { annotateAbbreviations } from '../abbr.js';
import {
  categoryLabel,
  clearError,
  confirmDialog,
  entryLetterLabel,
  inlineErrorHTML,
  renderPager,
  showError,
  skeletonHTML,
  toast,
} from '../components.js';
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  qs,
  qsa,
  relativeTime,
  truncate,
} from '../utils.js';

const CATEGORY_FALLBACK = [
  { key: 'front', label: '卷首' },
  { key: 'appendix', label: '附录' },
  { key: 'afterword', label: '后记' },
  { key: 'archive', label: '版本档案' },
];

function recentEntryHTML(entry) {
  return `<li class="admin-recent-item">
    <a class="admin-recent-link" href="#/entry/${encodeURIComponent(entry.id)}">
      <span class="admin-recent-title">【${escapeHtml(entry.headword || '')}】</span>
      <span class="admin-recent-time">${escapeHtml(relativeTime(entry.updated_at || entry.created_at))}</span>
    </a>
  </li>`;
}

function recentArticleHTML(article, categories) {
  return `<li class="admin-recent-item">
    <a class="admin-recent-link" href="#/article/${encodeURIComponent(article.id)}">
      <span class="admin-recent-title">${escapeHtml(article.title || '')}</span>
      <span class="admin-recent-time">${escapeHtml(relativeTime(article.updated_at || article.created_at))}</span>
    </a>
    <a class="admin-recent-edit" href="#/edit-article/${encodeURIComponent(article.id)}">修订</a>
  </li>`;
}

function manageEntriesHTML(response) {
  const items = response && Array.isArray(response.items) ? response.items : [];
  if (items.length === 0) {
    return `<div class="manage-empty">
      <p>没有匹配的词条。</p>
    </div>`;
  }
  return `<div class="manage-table-wrap">
    <table class="manage-table">
      <thead>
        <tr>
          <th scope="col">词条</th>
          <th scope="col">字母</th>
          <th scope="col">来源</th>
          <th scope="col">更新时间</th>
          <th scope="col" class="manage-col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (entry) => `<tr>
              <td class="manage-col-word">
                <a class="manage-word" href="#/entry/${encodeURIComponent(entry.id)}">【${escapeHtml(
                  entry.headword || ''
                )}】</a>
                <span class="manage-def">${annotateAbbreviations(
                  truncate(entry.definition || '', 48)
                )}</span>
              </td>
              <td>${escapeHtml(entryLetterLabel(entry))}</td>
              <td>${escapeHtml(entry.source || '—')}</td>
              <td><time datetime="${escapeHtml(entry.updated_at || '')}" title="${escapeHtml(
                formatDateTime(entry.updated_at || entry.created_at)
              )}">${escapeHtml(formatDate(entry.updated_at || entry.created_at))}</time></td>
              <td class="manage-col-actions">
                <button type="button" class="btn btn-ghost btn-small btn-quiet-danger"
                  data-delete-entry="${escapeHtml(String(entry.id))}"
                  data-delete-name="${escapeHtml(entry.headword || '')}">删除</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function manageArticlesHTML(response, categories) {
  const items = response && Array.isArray(response.items) ? response.items : [];
  if (items.length === 0) {
    return `<div class="manage-empty">
      <p>文集暂时没有文章。</p>
      <a class="btn btn-primary btn-small" href="#/new-article">新增文章</a>
    </div>`;
  }
  return `<div class="manage-table-wrap">
    <table class="manage-table">
      <thead>
        <tr>
          <th scope="col">标题</th>
          <th scope="col">分类</th>
          <th scope="col">字数</th>
          <th scope="col">更新时间</th>
          <th scope="col" class="manage-col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (article) => `<tr>
              <td class="manage-col-word">
                <a class="manage-word" href="#/article/${encodeURIComponent(article.id)}">${escapeHtml(
                  article.title || ''
                )}</a>
                ${article.subtitle ? `<span class="manage-def">${escapeHtml(article.subtitle)}</span>` : ''}
              </td>
              <td>${escapeHtml(categoryLabel(categories, article.category))}</td>
              <td>${article.word_count ? `约 ${article.word_count} 字` : '—'}</td>
              <td><time datetime="${escapeHtml(article.updated_at || '')}" title="${escapeHtml(
                formatDateTime(article.updated_at || article.created_at)
              )}">${escapeHtml(formatDate(article.updated_at || article.created_at))}</time></td>
              <td class="manage-col-actions">
                <a class="btn btn-ghost btn-small" href="#/edit-article/${encodeURIComponent(article.id)}">编辑</a>
                <button type="button" class="btn btn-ghost btn-small btn-quiet-danger"
                  data-delete-article="${escapeHtml(String(article.id))}"
                  data-delete-name="${escapeHtml(article.title || '')}">删除</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

export default {
  async render(ctx) {
    clearError();
    ctx.setTitle('编纂台');

    ctx.mount.innerHTML = `<div class="admin-page">
      <header class="admin-head">
        <p class="eyebrow">编纂台</p>
        <h1 class="admin-title">编纂台</h1>
        <div class="admin-actions">
          <a class="admin-action" href="#/new-article">
            <span class="admin-action-mark" aria-hidden="true">文</span>
            <span class="admin-action-title">新增文章</span>
          </a>
          <button type="button" class="admin-action" data-scroll-manage>
            <span class="admin-action-mark" aria-hidden="true">录</span>
            <span class="admin-action-title">管理词条</span>
          </button>
        </div>
      </header>

      <section class="admin-panel paper-card" aria-labelledby="recent-admin-title">
        <div class="panel-head">
          <h2 class="panel-title" id="recent-admin-title">最近修订</h2>
        </div>
        <div class="admin-recent-grid">
          <div class="admin-recent-col">
            <h3 class="admin-recent-heading">词条</h3>
            <ul class="admin-recent-list" data-recent-entries>${skeletonHTML('list', 2)}</ul>
          </div>
          <div class="admin-recent-col">
            <h3 class="admin-recent-heading">文章</h3>
            <ul class="admin-recent-list" data-recent-articles>${skeletonHTML('list', 2)}</ul>
          </div>
        </div>
      </section>

      <section class="admin-panel paper-card" id="admin-manage" aria-labelledby="manage-entries-title">
        <div class="panel-head">
          <h2 class="panel-title" id="manage-entries-title">词条管理</h2>
          <span class="panel-note" data-entry-total></span>
        </div>
        <form class="manage-filter" data-entry-filter role="search">
          <label class="visually-hidden" for="manage-filter-input">筛选词条</label>
          <input id="manage-filter-input" name="q" type="search" placeholder="按词条名或释义筛选…" autocomplete="off">
          <button class="btn btn-secondary btn-small" type="submit">筛选</button>
          <button class="btn btn-ghost btn-small" type="button" data-filter-reset hidden>清除</button>
        </form>
        <div data-entry-table>${skeletonHTML('list', 4)}</div>
        <div class="manage-pager" data-entry-pager></div>
      </section>

      <section class="admin-panel paper-card" aria-labelledby="manage-articles-title">
        <div class="panel-head">
          <h2 class="panel-title" id="manage-articles-title">文章管理</h2>
          <span class="panel-note" data-article-total></span>
        </div>
        <div data-article-table>${skeletonHTML('list', 3)}</div>
      </section>
    </div>`;

    const recentEntriesBox = qs('[data-recent-entries]', ctx.mount);
    const recentArticlesBox = qs('[data-recent-articles]', ctx.mount);
    const entryTableBox = qs('[data-entry-table]', ctx.mount);
    const entryPagerBox = qs('[data-entry-pager]', ctx.mount);
    const articleTableBox = qs('[data-article-table]', ctx.mount);
    const filterForm = qs('[data-entry-filter]', ctx.mount);
    const filterInput = qs('input[name="q"]', filterForm);
    const filterReset = qs('[data-filter-reset]', filterForm);
    const state = { q: '', page: 1 };
    const categories = CATEGORY_FALLBACK;

    const scrollButton = qs('[data-scroll-manage]', ctx.mount);
    if (scrollButton) {
      scrollButton.addEventListener('click', () => {
        const target = document.getElementById('admin-manage');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const bindDeleteHandlers = (container) => {
      container.querySelectorAll('[data-delete-entry]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = button.dataset.deleteEntry;
          const name = button.dataset.deleteName || '';
          const confirmed = await confirmDialog({
            title: '删除词条',
            message: `确认删除【${name}】吗？此操作不可恢复。`,
            confirmText: '确认删除',
            tone: 'danger',
          });
          if (!confirmed) return;
          button.disabled = true;
          try {
            await api.deleteEntry(id);
            toast(`已删除【${name}】`);
            await loadEntries();
            await loadRecent();
          } catch (error) {
            if (isAbortError(error)) return;
            button.disabled = false;
            toast(error.message || '删除失败，请稍后重试。', { type: 'error' });
          }
        });
      });
      container.querySelectorAll('[data-delete-article]').forEach((button) => {
        button.addEventListener('click', async () => {
          const id = button.dataset.deleteArticle;
          const name = button.dataset.deleteName || '';
          const confirmed = await confirmDialog({
            title: '删除文章',
            message: `确认删除《${name}》吗？此操作不可恢复。`,
            confirmText: '确认删除',
            tone: 'danger',
          });
          if (!confirmed) return;
          button.disabled = true;
          try {
            await api.deleteArticle(id);
            toast(`已删除《${name}》`);
            await loadArticles();
            await loadRecent();
          } catch (error) {
            if (isAbortError(error)) return;
            button.disabled = false;
            toast(error.message || '删除失败，请稍后重试。', { type: 'error' });
          }
        });
      });
    };

    const loadRecent = async () => {
      const [entriesResult, articlesResult] = await Promise.allSettled([
        api.entries({ page: 1, page_size: 5, sort: 'updated' }, ctx.signal),
        api.articles({ page: 1, page_size: 5, sort: 'updated' }, ctx.signal),
      ]);
      if (ctx.signal.aborted) return;
      if (entriesResult.status === 'fulfilled' && recentEntriesBox) {
        const items = Array.isArray(entriesResult.value.items) ? entriesResult.value.items : [];
        recentEntriesBox.innerHTML =
          items.map(recentEntryHTML).join('') || '<li class="admin-recent-empty">暂无词条修订记录。</li>';
      } else {
        recentEntriesBox.innerHTML = '<li class="admin-recent-empty">词条修订记录加载失败。</li>';
      }
      if (articlesResult.status === 'fulfilled' && recentArticlesBox) {
        const items = Array.isArray(articlesResult.value.items) ? articlesResult.value.items : [];
        recentArticlesBox.innerHTML =
          items.map((article) => recentArticleHTML(article, categories)).join('') ||
          '<li class="admin-recent-empty">暂无文章修订记录。</li>';
      } else {
        recentArticlesBox.innerHTML = '<li class="admin-recent-empty">文章修订记录加载失败。</li>';
      }
    };

    const loadEntries = async () => {
      if (!entryTableBox) return;
      entryTableBox.innerHTML = skeletonHTML('list', 4);
      try {
        const response = await api.entries(
          {
            q: state.q || undefined,
            page: state.page,
            page_size: 20,
            sort: 'updated',
          },
          ctx.signal
        );
        if (ctx.signal.aborted) return;
        entryTableBox.innerHTML = manageEntriesHTML(response);
        bindDeleteHandlers(entryTableBox);
        const totalBox = qs('[data-entry-total]', ctx.mount);
        if (totalBox) totalBox.textContent = `共 ${response.total || 0} 条`;
        renderPager(entryPagerBox, {
          page: response.page || state.page,
          pages: response.pages || 1,
          total: response.total || 0,
          onChange(page) {
            state.page = page;
            loadEntries();
            const panel = document.getElementById('admin-manage');
            if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        });
      } catch (error) {
        if (isAbortError(error)) return;
        entryTableBox.innerHTML = inlineErrorHTML('词条列表加载失败。');
        const retry = qs('[data-inline-retry]', entryTableBox);
        if (retry) retry.addEventListener('click', () => loadEntries());
      }
    };

    const loadArticles = async () => {
      if (!articleTableBox) return;
      try {
        const response = await api.articles(
          { page: 1, page_size: 100, sort: 'updated' },
          ctx.signal
        );
        if (ctx.signal.aborted) return;
        const items = Array.isArray(response.items) ? response.items : [];
        articleTableBox.innerHTML = manageArticlesHTML(response, categories);
        bindDeleteHandlers(articleTableBox);
        const totalBox = qs('[data-article-total]', ctx.mount);
        if (totalBox) totalBox.textContent = `共 ${response.total || items.length} 篇`;
      } catch (error) {
        if (isAbortError(error)) return;
        articleTableBox.innerHTML = inlineErrorHTML('文章列表加载失败。');
        const retry = qs('[data-inline-retry]', articleTableBox);
        if (retry) retry.addEventListener('click', () => loadArticles());
      }
    };

    if (filterForm) {
      filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        state.q = filterInput.value.trim();
        state.page = 1;
        filterReset.hidden = !state.q;
        loadEntries();
      });
      filterReset.addEventListener('click', () => {
        filterInput.value = '';
        state.q = '';
        state.page = 1;
        filterReset.hidden = true;
        loadEntries();
      });
    }

    const results = await Promise.allSettled([loadRecent(), loadEntries(), loadArticles()]);
    if (ctx.signal.aborted) return;
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      showError('编纂台部分内容加载失败，请稍后重试。', () => ctx.refresh());
    }
  },
};
