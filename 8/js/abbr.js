/**
 * 正文人名缩写悬停提示。
 * 映射严格来自各版「人名缩写解释」附录；只处理正文释义文本，标题/作者/附录不处理。
 */
import { api } from './api.js';
import { escapeHtml } from './utils.js';

const names = new Map();
let loadingPromise = null;
let tooltip = null;

function normalize(value) {
  return String(value || '').replace(/\s+/g, '');
}

/** 载入当前版本的缩写表。失败时保持空表，不影响页面其它功能。 */
export function loadAbbreviations(signal) {
  if (names.size) return Promise.resolve(names);
  if (loadingPromise) return loadingPromise;
  loadingPromise = api
    .abbreviations(signal)
    .then((payload) => {
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        const abbr = normalize(item.abbr).toUpperCase();
        const name = normalize(item.name);
        if (abbr && name && !names.has(abbr)) names.set(abbr, name);
      });
      return names;
    })
    .catch(() => names)
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

/** 是否有可用的缩写表。 */
export function hasAbbreviations() {
  return names.size > 0;
}

const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*/g;

/** 把纯文本中的已知缩写包成 <abbr class="abbr-name">，其余照常转义。 */
export function annotateAbbreviations(text) {
  const value = String(text || '');
  if (!names.size) return escapeHtml(value);
  let html = '';
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match = TOKEN_RE.exec(value);
  while (match) {
    const token = match[0];
    const name = names.get(token.toUpperCase());
    if (name) {
      html += escapeHtml(value.slice(last, match.index));
      html += `<abbr class="abbr-name" data-abbr-name="${escapeHtml(
        name
      )}" tabindex="0">${escapeHtml(token)}</abbr>`;
      last = match.index + token.length;
    }
    match = TOKEN_RE.exec(value);
  }
  html += escapeHtml(value.slice(last));
  return html;
}

/** 处理已转义 HTML（如搜索高亮片段）中的文本节点，不碰标签本身。 */
export function annotateAbbreviationsInHtml(html) {
  const value = String(html || '');
  if (!names.size) return value;
  let result = '';
  let last = 0;
  const tagRe = /<[^>]*>/g;
  let match = tagRe.exec(value);
  while (match) {
    result += annotateAbbreviations(value.slice(last, match.index));
    result += match[0];
    last = match.index + match[0].length;
    match = tagRe.exec(value);
  }
  result += annotateAbbreviations(value.slice(last));
  return result;
}

function placeTooltip(x, y) {
  if (!tooltip) return;
  const pad = 12;
  const rect = tooltip.getBoundingClientRect();
  let left = x + 14;
  let top = y + 18;
  if (left + rect.width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - pad - rect.width);
  }
  if (top + rect.height > window.innerHeight - pad) {
    top = Math.max(pad, y - rect.height - 10);
  }
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function hideTooltip() {
  if (!tooltip) return;
  tooltip.hidden = true;
}

function showTooltip(element, x, y, anchorRect) {
  if (!tooltip) return;
  const name = element.getAttribute('data-abbr-name') || '';
  if (!name) return;
  tooltip.textContent = name;
  tooltip.hidden = false;
  if (anchorRect) {
    placeTooltip(anchorRect.left + anchorRect.width / 2, anchorRect.bottom);
  } else {
    placeTooltip(x, y);
  }
}

/** 绑定全站悬停事件（只响应带 data-abbr-name 的正文缩写）。 */
export function initAbbrTooltip() {
  if (tooltip) return;
  tooltip = document.createElement('div');
  tooltip.className = 'abbr-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  const targetOf = (event) => {
    const target = event.target;
    if (!target || target.nodeType !== 1 || !target.closest) return null;
    return target.closest('abbr.abbr-name');
  };

  document.addEventListener('mouseover', (event) => {
    const element = targetOf(event);
    if (element) showTooltip(element, event.clientX, event.clientY);
  });

  document.addEventListener('mousemove', (event) => {
    if (!tooltip || tooltip.hidden) return;
    const element = targetOf(event);
    if (element) placeTooltip(event.clientX, event.clientY);
    else hideTooltip();
  });

  document.addEventListener('mouseout', (event) => {
    const element = targetOf(event);
    if (!element) return;
    const next = event.relatedTarget;
    if (next && element.contains(next)) return;
    hideTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const element = targetOf(event);
    if (!element) return;
    showTooltip(element, 0, 0, element.getBoundingClientRect());
  });

  document.addEventListener('focusout', hideTooltip);
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);
}
