/**
 * 词条详情：#/entry/:id
 * 词条名、字母与来源、释义（【交叉引用】自动链接）、修订/删除、上下词条。
 */
import { api, ApiError, isAbortError } from '../api.js';
import {
  clearError,
  confirmDialog,
  entryDefinitionHTML,
  entryLetterLabel,
  showError,
  skeletonHTML,
  toast,
  upgradeXrefs,
} from '../components.js';
import { escapeHtml, formatDateTime, qs } from '../utils.js';

function browseHrefFor(entry) {
  if (!entry) return '#/browse';
  if (entry.section === 'western' || entry.letter === '西文') return '#/browse?section=western';
  return `#/browse?letter=${encodeURIComponent(String(entry.letter || '').toUpperCase())}`;
}

function relatedHTML(related) {
  const list = Array.isArray(related) ? related.filter(Boolean) : [];
  if (list.length === 0) return '';
  return `<section class="entry-related" aria-labelledby="related-title">
    <h2 class="related-title" id="related-title">相关条目</h2>
    <ul class="related-list">
      ${list
        .map(
          (item) =>
            `<li><a class="related-chip" href="#/entry/${encodeURIComponent(item.id)}">【${escapeHtml(
              item.headword || ''
            )}】</a></li>`
        )
        .join('')}
    </ul>
  </section>`;
}

function neighborHTML(direction, neighbor) {
  const isPrev = direction === 'prev';
  const label = isPrev ? '上一条' : '下一条';
  const arrow = isPrev ? '←' : '→';
  if (!neighbor) {
    return `<span class="neighbor neighbor--disabled">
      <span class="neighbor-label">${label}</span>
      <span class="neighbor-headword">已至${isPrev ? '首' : '末'}条</span>
    </span>`;
  }
  return `<a class="neighbor${isPrev ? '' : ' neighbor--next'}" href="#/entry/${encodeURIComponent(
    neighbor.id
  )}">
    <span class="neighbor-label">${isPrev ? `${arrow} ${label}` : `${label} ${arrow}`}</span>
    <span class="neighbor-headword">【${escapeHtml(neighbor.headword || '')}】</span>
  </a>`;
}

export default {
  async render(ctx) {
    clearError();
    ctx.mount.innerHTML = skeletonHTML('article');

    let data;
    try {
      data = await api.entry(ctx.params.id, ctx.signal);
    } catch (error) {
      if (isAbortError(error)) return;
      const notFound = error instanceof ApiError && error.status === 404;
      ctx.setTitle(notFound ? '此条未收录' : '词条加载失败');
      ctx.mount.innerHTML = `<section class="entry-error" role="alert">
        <p class="entry-error-kicker">${notFound ? '未收此语' : '连接中断'}</p>
        <h1 class="entry-error-title">${notFound ? '此条未收录' : '词条暂时打不开'}</h1>
        <p class="entry-error-message">${escapeHtml(
          notFound ? '词典中查不到这个词条，它或许还未被收录。' : error.message
        )}</p>
        <div class="entry-error-actions">
          ${
            notFound
              ? ''
              : '<button type="button" class="btn btn-primary" data-retry>重试</button>'
          }
          <a class="btn btn-secondary" href="#/browse">返回词典正文</a>
        </div>
      </section>`;
      const retry = qs('[data-retry]', ctx.mount);
      if (retry) retry.addEventListener('click', () => ctx.refresh());
      if (!notFound) showError(error.message, () => ctx.refresh());
      return;
    }
    if (ctx.signal.aborted) return;

    const entry = (data && data.entry) || {};
    const prev = data ? data.prev : null;
    const next = data ? data.next : null;
    const related = data && Array.isArray(data.related) ? data.related : [];
    const letterLabel = entryLetterLabel(entry);
    const backHref = browseHrefFor(entry);
    ctx.setTitle(`【${entry.headword || '词条'}】`);

    const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : [];
    const tagsHTML = tags.length
      ? `<ul class="tag-list" aria-label="标签">${tags
          .map(
            (tag) =>
              `<li><a class="tag" href="#/search?q=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a></li>`
          )
          .join('')}</ul>`
      : '';

    const pinyinHTML = entry.pinyin
      ? `<p class="entry-pinyin">拼音：${escapeHtml(entry.pinyin)}</p>`
      : '';

    ctx.mount.innerHTML = `
      <article class="entry-sheet paper-card">
        <header class="entry-head">
          <p class="entry-kicker">${escapeHtml(
            entry.section === 'western' ? '西文' : `词典正文 · ${letterLabel}`
          )}</p>
          <h1 class="entry-headword">【${escapeHtml(entry.headword || '')}】</h1>
          <p class="entry-meta">
            <span class="entry-letter-badge">${escapeHtml(letterLabel)}</span>
            <span>来源：${escapeHtml(entry.source || '《现代梗语词典》正文')}</span>
            <span>更新于 ${escapeHtml(formatDateTime(entry.updated_at || entry.created_at))}</span>
          </p>
          ${pinyinHTML}
        </header>
        <div class="entry-rule" aria-hidden="true"></div>
        <div class="entry-definition" data-definition>
          ${entryDefinitionHTML(entry.definition)}
        </div>
        ${tagsHTML}
        <div class="entry-actions">
          <button type="button" class="btn btn-secondary btn-quiet-danger" data-delete-entry>删除</button>
          <a class="btn btn-ghost" href="${backHref}">返回 ${escapeHtml(letterLabel)} 组</a>
        </div>
      </article>

      ${relatedHTML(related)}

      <nav class="entry-pager" aria-label="上下词条">
        ${neighborHTML('prev', prev)}
        ${neighborHTML('next', next)}
      </nav>
    `;

    const definitionElement = qs('[data-definition]', ctx.mount);
    upgradeXrefs(definitionElement, ctx.signal);

    const deleteButton = qs('[data-delete-entry]', ctx.mount);
    if (deleteButton) {
      deleteButton.addEventListener('click', async () => {
        const confirmed = await confirmDialog({
          title: '删除词条',
          message: `确认删除「${entry.headword || ''}」吗？删除后不可恢复。`,
          confirmText: '确认删除',
          cancelText: '取消',
          tone: 'danger',
        });
        if (!confirmed) return;
        deleteButton.disabled = true;
        deleteButton.textContent = '删除中…';
        try {
          await api.deleteEntry(entry.id);
          toast(`已删除【${entry.headword || '词条'}】`);
          window.location.hash = backHref;
        } catch (error) {
          if (isAbortError(error)) return;
          deleteButton.disabled = false;
          deleteButton.textContent = '删除';
          toast(error.message || '删除失败，请稍后重试。', { type: 'error' });
        }
      });
    }
  },
};
