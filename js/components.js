/**
 * 通用 UI 组件：搜索框与联想、toast、确认框、错误条、骨架、
 * 检字表、分页、词条释义渲染（含【交叉引用】自动链接）等。
 */
import { api, isAbortError } from './api.js';
import { annotateAbbreviations } from './abbr.js';
import {
  debounce,
  escapeHtml,
  formatDateTime,
  fromHTML,
  highlightText,
  qs,
  scrollPageToTop,
  truncate,
  uid,
} from './utils.js';

export const LETTER_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const CATEGORY_FALLBACK = {
  front: '卷首',
  appendix: '附录',
  afterword: '后记',
  archive: '版本档案',
};

/** 归一化字母 key（兼容后端返回「西文」或 western）。 */
export function normalizeLetterKey(key) {
  const value = String(key || '').trim();
  if (value === '西文' || value.toLowerCase() === 'western') return 'western';
  return value.toUpperCase();
}

/** 合并 A–Z 与「西文」的检字表数据。 */
export function buildLetters(metaLetters) {
  const counts = new Map();
  (Array.isArray(metaLetters) ? metaLetters : []).forEach((item) => {
    if (!item) return;
    const key = normalizeLetterKey(item.key !== undefined ? item.key : item.label);
    counts.set(key, Number(item.count) || 0);
  });
  const letters = LETTER_KEYS.map((key) => ({
    key,
    label: key,
    count: counts.get(key) || 0,
    section: 'main',
  }));
  letters.push({
    key: 'western',
    label: '西文',
    count: counts.get('western') || 0,
    section: 'western',
  });
  return letters;
}

/** 分类中文名。 */
export function categoryLabel(categories, key) {
  const list = Array.isArray(categories) ? categories : [];
  const found = list.find((item) => item && item.key === key);
  if (found && found.label) return found.label;
  return CATEGORY_FALLBACK[key] || '未分类';
}

/** 词条所属字母的中文显示（西文归「西文」）。 */
export function entryLetterLabel(entry) {
  if (!entry) return '';
  if (entry.section === 'western' || normalizeLetterKey(entry.letter) === 'western') return '西文';
  return String(entry.letter || '').toUpperCase() || '未分字母';
}

/** 只保留有词条的字母（以及当前字母），避免检字表出现空字母。 */
export function visibleLetters(letters, includeKey) {
  const list = Array.isArray(letters) ? letters : [];
  const extra = includeKey ? normalizeLetterKey(includeKey) : '';
  return list.filter(
    (letter) => letter.count > 0 || normalizeLetterKey(letter.key) === extra
  );
}

/** 首页 A–Z 检字表网格。 */
export function letterGridHTML(letters) {
  const items = (letters || []).map((letter) => {
    const href =
      letter.section === 'western'
        ? '#/browse?section=western'
        : `#/browse?letter=${encodeURIComponent(letter.key)}`;
    const count = letter.count
      ? `<span class="letter-chip-count">${letter.count}</span>`
      : '';
    const emptyClass = letter.count ? '' : ' is-empty';
    const westernClass = letter.section === 'western' ? ' letter-chip--western' : '';
    const title = letter.count
      ? `按 ${letter.label} 检字，共 ${letter.count} 条`
      : `按 ${letter.label} 检字`;
    return `<a class="letter-chip${westernClass}${emptyClass}" href="${href}" title="${escapeHtml(
      title
    )}" aria-label="${escapeHtml(title)}"><span class="letter-chip-key">${escapeHtml(
      letter.label
    )}</span>${count}</a>`;
  });
  return `<div class="letter-grid" role="group" aria-label="首字母检字表">${items.join('')}</div>`;
}

/** 浏览页左侧竖排检字表导轨。 */
export function letterRailHTML(letters, activeKey) {
  const active = normalizeLetterKey(activeKey);
  const items = (letters || []).map((letter) => {
    const href =
      letter.section === 'western'
        ? '#/browse?section=western'
        : `#/browse?letter=${encodeURIComponent(letter.key)}`;
    const isActive = normalizeLetterKey(letter.key) === active;
    const classes = ['letter-rail-item'];
    if (isActive) classes.push('is-active');
    if (!letter.count) classes.push('is-empty');
    const count = letter.count ? `<span class="letter-rail-count">${letter.count}</span>` : '';
    const title = isActive ? `当前：${letter.label}` : `跳至 ${letter.label}`;
    return `<a class="${classes.join(' ')}" href="${href}" title="${escapeHtml(title)}"${
      isActive ? ' aria-current="true"' : ''
    }><span class="letter-rail-key">${escapeHtml(letter.label)}</span>${count}</a>`;
  });
  return `<nav class="letter-rail" aria-label="检字表">${items.join('')}</nav>`;
}

/** 通用搜索表单 HTML。 */
export function searchFormHTML({ value = '', variant = '', placeholder = '' } = {}) {
  const inputId = uid('search');
  const variantClass = variant ? ` search-box--${variant}` : '';
  return `<form class="search-box${variantClass}" role="search" data-search-form>
    <label class="visually-hidden" for="${inputId}">检索词条或文章</label>
    <input class="search-box-input" id="${inputId}" name="q" type="search" autocomplete="off" spellcheck="false"
      value="${escapeHtml(value)}" placeholder="${escapeHtml(
        placeholder || '输入词条、释义或文章标题…'
      )}">
    <button class="btn btn-primary search-box-btn" type="submit">检索</button>
  </form>`;
}

/** 创建联想下拉容器。 */
function ensureSuggestContainer(form) {
  let container = qs('.search-suggest', form);
  if (container) return container;
  container = document.createElement('div');
  container.className = 'search-suggest';
  container.hidden = true;
  form.appendChild(container);
  return container;
}

/**
 * 为搜索表单绑定提交与联想。
 * @param {HTMLFormElement} form
 * @param {{onSubmit?:Function, suggest?:boolean}} options
 */
export function bindSearchBox(form, { onSubmit, suggest = true } = {}) {
  if (!form) return null;
  const input = qs('input[name="q"]', form) || qs('input[type="search"]', form);
  if (!input) return null;
  const container = ensureSuggestContainer(form);
  const listId = uid('suggest-list');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);

  let items = [];
  let activeIndex = -1;
  let requestSeq = 0;

  const close = () => {
    items = [];
    activeIndex = -1;
    container.hidden = true;
    container.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };

  const renderActive = () => {
    const options = Array.from(container.querySelectorAll('.suggest-item'));
    options.forEach((option, index) => {
      const isActive = index === activeIndex;
      option.classList.toggle('is-active', isActive);
      option.setAttribute('aria-selected', String(isActive));
    });
    if (activeIndex >= 0 && items[activeIndex]) {
      input.setAttribute('aria-activedescendant', `suggest-${listId}-${activeIndex}`);
      const option = options[activeIndex];
      if (option && option.scrollIntoView) option.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };

  const pick = (item) => {
    close();
    if (!item) return;
    if (item.type === 'article') {
      window.location.hash = `#/article/${encodeURIComponent(item.id)}`;
    } else {
      window.location.hash = `#/entry/${encodeURIComponent(item.id)}`;
    }
    if (input.blur) input.blur();
  };

  const renderSuggestions = (results) => {
    if (!Array.isArray(results) || results.length === 0) {
      close();
      return;
    }
    items = results;
    activeIndex = -1;
    container.id = listId;
    container.setAttribute('role', 'listbox');
    container.innerHTML = results
      .map((item, index) => {
        const typeLabel = item.type === 'article' ? '文章' : '词条';
        const extra = item.extra ? `<span class="suggest-extra">${escapeHtml(item.extra)}</span>` : '';
        return `<button type="button" class="suggest-item" role="option" aria-selected="false" id="suggest-${listId}-${index}" data-index="${index}">
          <span class="suggest-type">${typeLabel}</span>
          <span class="suggest-text">${escapeHtml(item.text || '')}</span>
          ${extra}
        </button>`;
      })
      .join('');
    container.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    container.querySelectorAll('.suggest-item').forEach((button) => {
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        pick(items[Number(button.dataset.index)]);
      });
    });
  };

  const runSuggest = debounce(async () => {
    if (!suggest) return;
    const keyword = input.value.trim();
    if (!keyword) {
      close();
      return;
    }
    const seq = ++requestSeq;
    try {
      const response = await api.suggest(keyword);
      if (seq !== requestSeq) return;
      if (document.activeElement !== input && !form.contains(document.activeElement)) {
        close();
        return;
      }
      renderSuggestions(response && response.items ? response.items : []);
    } catch (error) {
      if (seq !== requestSeq || isAbortError(error)) return;
      close();
    }
  }, 250);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      return;
    }
    if (activeIndex >= 0 && items[activeIndex]) {
      pick(items[activeIndex]);
      return;
    }
    close();
    if (typeof onSubmit === 'function') {
      onSubmit(keyword);
    } else {
      window.location.hash = `#/search?q=${encodeURIComponent(keyword)}`;
    }
    if (input.blur && document.activeElement === input) input.blur();
  });

  input.addEventListener('input', () => {
    if (!input.value.trim()) {
      close();
      return;
    }
    runSuggest();
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) runSuggest();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (items.length === 0) return;
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      renderActive();
      return;
    }
    if (event.key === 'ArrowUp') {
      if (items.length === 0) return;
      event.preventDefault();
      activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
      renderActive();
      return;
    }
    if (event.key === 'Escape') {
      if (!container.hidden) {
        event.preventDefault();
        close();
      }
      return;
    }
    if (event.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        event.preventDefault();
        pick(items[activeIndex]);
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!form.contains(event.target)) close();
  });

  return {
    input,
    close,
    setValue(value) {
      input.value = value || '';
    },
  };
}

/** 右下角 toast，3 秒自动消失。 */
export function toast(message, { type = 'success', duration = 3000 } = {}) {
  const zone = document.getElementById('toast-zone') || document.body;
  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  node.innerHTML = `<span class="toast-mark" aria-hidden="true"></span><p class="toast-text">${escapeHtml(
    message
  )}</p>`;
  zone.appendChild(node);
  window.requestAnimationFrame(() => node.classList.add('is-visible'));
  const dismiss = () => {
    node.classList.remove('is-visible');
    node.classList.add('is-leaving');
    window.setTimeout(() => node.remove(), 280);
  };
  const timer = window.setTimeout(dismiss, duration);
  node.addEventListener('click', () => {
    window.clearTimeout(timer);
    dismiss();
  });
  return node;
}

/**
 * 居中确认弹窗，返回 Promise<boolean>。
 */
export function confirmDialog({
  title = '请确认',
  message = '',
  confirmText = '确认',
  cancelText = '取消',
  tone = 'danger',
} = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog-root') || document.body;
    const previousFocus = document.activeElement;
    const dialogId = uid('dialog');
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="${dialogId}-title" aria-describedby="${dialogId}-desc">
      <h2 class="dialog-title" id="${dialogId}-title">${escapeHtml(title)}</h2>
      <div class="dialog-body" id="${dialogId}-desc">${escapeHtml(message)}</div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-dialog-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="btn ${
          tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'
        }" data-dialog-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
    root.appendChild(backdrop);
    document.body.classList.add('dialog-open');
    const dialog = qs('.dialog', backdrop);
    const cancelButton = qs('[data-dialog-cancel]', backdrop);
    const confirmButton = qs('[data-dialog-confirm]', backdrop);

    const cleanup = (result) => {
      document.removeEventListener('keydown', onKeydown, true);
      backdrop.remove();
      document.body.classList.remove('dialog-open');
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try {
          previousFocus.focus();
        } catch (error) {
          /* 忽略焦点恢复失败 */
        }
      }
      resolve(result);
    };

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup(false);
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [cancelButton, confirmButton].filter(Boolean);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    cancelButton.addEventListener('click', () => cleanup(false));
    confirmButton.addEventListener('click', () => cleanup(true));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) cleanup(false);
    });
    document.addEventListener('keydown', onKeydown, true);
    window.requestAnimationFrame(() => {
      backdrop.classList.add('is-visible');
      cancelButton.focus();
    });
  });
}

/** 顶部红色错误条（带重试）。 */
export function showError(message, onRetry) {
  const zone = document.getElementById('error-zone');
  if (!zone) return;
  zone.innerHTML = `<div class="error-bar" role="alert">
    <span class="error-bar-label">加载失败</span>
    <p class="error-bar-message">${escapeHtml(message || '请求失败，请稍后重试。')}</p>
    <div class="error-bar-actions">
      <button type="button" class="error-bar-retry">重试</button>
      <button type="button" class="error-bar-close" aria-label="关闭错误提示">×</button>
    </div>
  </div>`;
  const retryButton = qs('.error-bar-retry', zone);
  if (retryButton) {
    retryButton.addEventListener('click', () => {
      clearError();
      if (typeof onRetry === 'function') onRetry();
    });
  }
  const closeButton = qs('.error-bar-close', zone);
  if (closeButton) closeButton.addEventListener('click', clearError);
}

/** 清除错误条。 */
export function clearError() {
  const zone = document.getElementById('error-zone');
  if (zone) zone.innerHTML = '';
}

/** 骨架屏 HTML。 */
export function skeletonHTML(kind = 'list', count = 5) {
  if (kind === 'article') {
    return `<div class="skeleton-sheet" aria-hidden="true">
      <div class="sk-line sk-line--title"></div>
      <div class="sk-line sk-line--sub"></div>
      <div class="sk-gap"></div>
      ${new Array(7).fill('<div class="sk-line"></div>').join('')}
      <div class="sk-line sk-line--short"></div>
      <div class="sk-gap"></div>
      ${new Array(4).fill('<div class="sk-line"></div>').join('')}
    </div>`;
  }
  if (kind === 'form') {
    return `<div class="skeleton-sheet" aria-hidden="true">
      <div class="sk-line sk-line--title"></div>
      ${new Array(4)
        .fill('<div class="sk-field"></div><div class="sk-line sk-line--short"></div>')
        .join('')}
      <div class="sk-field sk-field--tall"></div>
    </div>`;
  }
  if (kind === 'home') {
    return `<div class="skeleton-home" aria-hidden="true">
      <div class="sk-cover"></div>
      <div class="sk-home-main">
        <div class="sk-line sk-line--title"></div>
        <div class="sk-line sk-line--sub"></div>
        ${new Array(3).fill('<div class="sk-line"></div>').join('')}
        <div class="sk-field"></div>
      </div>
    </div>`;
  }
  const rows = new Array(Math.max(1, count))
    .fill('<div class="sk-line"></div><div class="sk-line sk-line--short"></div>')
    .join('');
  return `<div class="skeleton-sheet" aria-hidden="true">${rows}</div>`;
}

/** 页面内联错误块 HTML。 */
export function inlineErrorHTML(message) {
  return `<div class="inline-error" role="alert">
    <p>${escapeHtml(message || '内容加载失败，请重试。')}</p>
    <button type="button" class="btn btn-secondary btn-small" data-inline-retry>重试</button>
  </div>`;
}

/** 空状态 HTML。 */
export function emptyStateHTML({ title = '暂无内容', message = '', actions = '' } = {}) {
  return `<div class="empty-state">
    <p class="empty-title">${escapeHtml(title)}</p>
    ${message ? `<p class="empty-message">${escapeHtml(message)}</p>` : ''}
    ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
  </div>`;
}

/**
 * 词条释义渲染：转义、保留分段、【交叉引用】变成站内链接。
 * 初始链接指向搜索页，随后由 upgradeXrefs 换成精确词条链接。
 */
export function entryDefinitionHTML(text, { compact = false } = {}) {
  const source = String(text || '').trim();
  if (!source) {
    return '<p class="entry-definition-empty">此条暂无释义。</p>';
  }
  const paragraphs = source.split(/\n+/).filter((line) => line.trim());
  return paragraphs
    .map((paragraph) => {
      let html = '';
      let lastIndex = 0;
      const regex = /【([^】]{1,40})】/g;
      let match = regex.exec(paragraph);
      while (match) {
        html += annotateAbbreviations(paragraph.slice(lastIndex, match.index));
        const ref = match[1].trim();
        html += `<a class="xref" href="#/search?q=${encodeURIComponent(
          ref
        )}" data-ref="${escapeHtml(ref)}">【${escapeHtml(ref)}】</a>`;
        lastIndex = regex.lastIndex;
        match = regex.exec(paragraph);
      }
      html += annotateAbbreviations(paragraph.slice(lastIndex));
      return compact ? html : `<p>${html}</p>`;
    })
    .join(compact ? '<br>' : '');
}

const xrefCache = new Map();

/** 将释义中的【xxx】升级为精确词条链接，失败保留搜索链接。 */
export async function upgradeXrefs(root, signal) {
  if (!root) return;
  const anchors = Array.from(root.querySelectorAll('a.xref[data-ref]'));
  if (anchors.length === 0) return;
  const refs = Array.from(new Set(anchors.map((anchor) => anchor.dataset.ref))).filter(Boolean);
  await Promise.all(
    refs.map(async (ref) => {
      if (signal && signal.aborted) return;
      let targetId = xrefCache.get(ref);
      if (targetId === undefined) {
        try {
          const response = await api.entries({ q: ref, page_size: 10 }, signal);
          const list = response && Array.isArray(response.items) ? response.items : [];
          const exact = list.find(
            (entry) => String(entry.headword || '').trim() === String(ref).trim()
          );
          targetId = exact ? exact.id : null;
        } catch (error) {
          if (isAbortError(error)) return;
          targetId = null;
        }
        xrefCache.set(ref, targetId);
      }
      if (targetId === null || targetId === undefined) return;
      if (signal && signal.aborted) return;
      anchors
        .filter((anchor) => anchor.dataset.ref === ref)
        .forEach((anchor) => {
          anchor.setAttribute('href', `#/entry/${encodeURIComponent(targetId)}`);
          anchor.classList.add('xref--resolved');
        });
    })
  );
}

/** 分页控件。 */
export function renderPager(container, { page = 1, pages = 1, total = 0, onChange } = {}) {
  if (!container) return;
  if (!pages || pages <= 1) {
    container.innerHTML = total
      ? `<p class="pager-total">共 ${total} 条</p>`
      : '';
    return;
  }
  container.innerHTML = `<nav class="pager" aria-label="分页">
    <button type="button" class="btn btn-secondary btn-small pager-prev" ${
      page <= 1 ? 'disabled' : ''
    }>上一页</button>
    <span class="pager-info">第 ${page} / ${pages} 页 · 共 ${total} 条</span>
    <button type="button" class="btn btn-secondary btn-small pager-next" ${
      page >= pages ? 'disabled' : ''
    }>下一页</button>
  </nav>`;
  const prevButton = qs('.pager-prev', container);
  const nextButton = qs('.pager-next', container);
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      if (page > 1 && typeof onChange === 'function') onChange(page - 1);
    });
  }
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      if (page < pages && typeof onChange === 'function') onChange(page + 1);
    });
  }
}

/** 词条名高亮（服务端 snippet 已安全转义，仅保留 <mark>）。 */
export function safeSnippetHTML(snippet, fallbackText, keyword) {
  if (snippet && /<mark>/.test(snippet)) return snippet;
  if (snippet) return escapeHtml(snippet);
  return highlightText(truncate(fallbackText || '', 180), keyword);
}

/** 初始化「回到顶部」浮动按钮（全站一次）。 */
export function initBackToTop() {
  const root = document.getElementById('backtop-root');
  if (!root) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-top';
  button.setAttribute('aria-label', '回到顶部');
  button.innerHTML = '<span class="back-top-arrow" aria-hidden="true">↑</span><span>回顶</span>';
  root.appendChild(button);
  const update = () => {
    button.classList.toggle('is-visible', window.scrollY > 420);
  };
  window.addEventListener('scroll', update, { passive: true });
  button.addEventListener('click', () => scrollPageToTop());
  update();
}

/** 时间标签，带完整时间 title。 */
export function timeHTML(value, { relative = true } = {}) {
  if (!value) return '';
  const full = formatDateTime(value);
  const label = relative ? formatDateTime(value).split(' ')[0] : full;
  return `<time class="time-label" datetime="${escapeHtml(value)}" title="${escapeHtml(
    full
  )}">${escapeHtml(relative ? label.replace(/^\d{4}年/, '') : label)}</time>`;
}
