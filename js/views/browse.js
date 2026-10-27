/**
 * 词典浏览：#/browse?letter=B 或 #/browse?section=western
 * 左侧竖排检字表导轨，右侧词典纸页与词条列表。
 */
import { api, isAbortError } from '../api.js';
import {
  buildLetters,
  clearError,
  emptyStateHTML,
  inlineErrorHTML,
  letterRailHTML,
  showError,
  skeletonHTML,
  visibleLetters,
} from '../components.js';
import { annotateAbbreviations } from '../abbr.js';
import { escapeHtml, qs, truncate } from '../utils.js';

function resolveActiveKey(query, letters) {
  const section = String(query.section || '').toLowerCase();
  if (section === 'western') return 'western';
  const letter = String(query.letter || '').trim();
  if (letter === '西文' || letter.toLowerCase() === 'western') return 'western';
  const upper = letter.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper;
  const firstWithEntries = letters.find((item) => item.section === 'main' && item.count > 0);
  return firstWithEntries ? firstWithEntries.key : 'A';
}

function letterDisplay(activeKey) {
  return activeKey === 'western' ? '西文' : activeKey;
}

function browseHref(key) {
  return key === 'western' ? '#/browse?section=western' : `#/browse?letter=${encodeURIComponent(key)}`;
}

function entryLineHTML(entry, index, activeKey) {
  const letter = activeKey === 'western' ? '西文' : String(entry.letter || activeKey);
  return `<a class="entry-line" href="#/entry/${encodeURIComponent(entry.id)}">
    <span class="entry-line-main">
      <span class="entry-line-headword">【${escapeHtml(entry.headword || '')}】</span>
      <span class="entry-line-def">${annotateAbbreviations(
      truncate(entry.definition || '', 116)
    )}</span>
    </span>
    <span class="entry-line-meta">${escapeHtml(letter)} · 第 ${index + 1} 页</span>
  </a>`;
}

function adjacentLetter(letters, activeKey, offset) {
  const index = letters.findIndex((item) => item.key === activeKey);
  if (index < 0) return null;
  const next = letters[index + offset];
  return next || null;
}

export default {
  async render(ctx) {
    clearError();
    ctx.mount.innerHTML = skeletonHTML('list', 6);

    let meta = null;
    let metaFailed = false;
    try {
      meta = await api.meta(ctx.signal);
    } catch (error) {
      if (isAbortError(error)) return;
      metaFailed = true;
    }
    if (ctx.signal.aborted) return;

    const letters = buildLetters(meta && meta.letters);
    const activeKey = resolveActiveKey(ctx.query, letters);
    const railLetters = visibleLetters(letters, activeKey);
    const label = letterDisplay(activeKey);
    const isWestern = activeKey === 'western';
    const sectionMeta =
      meta && Array.isArray(meta.sections)
        ? meta.sections.find((item) => item.key === (isWestern ? 'western' : 'main'))
        : null;
    const sectionTitle = sectionMeta && sectionMeta.title ? sectionMeta.title : isWestern ? '西文开头单词及数字的解释' : '词典正文';
    const sectionNote =
      sectionMeta && sectionMeta.note
        ? sectionMeta.note
        : isWestern
          ? '收录西文开头单词及数字的解释。'
          : '收录 A–Z 开头词条。';
    ctx.setTitle(`词典正文 · ${label}`);

    let entriesResponse = null;
    let entriesFailed = false;
    try {
      entriesResponse = await api.entries(
        {
          letter: isWestern ? undefined : activeKey,
          section: isWestern ? 'western' : 'main',
          page: 1,
          page_size: 100,
          sort: 'headword',
        },
        ctx.signal
      );
    } catch (error) {
      if (isAbortError(error)) return;
      entriesFailed = true;
    }
    if (ctx.signal.aborted) return;

    const items =
      entriesResponse && Array.isArray(entriesResponse.items) ? entriesResponse.items : [];
    const total =
      entriesResponse && entriesResponse.total !== undefined ? entriesResponse.total : items.length;
    const totalPages = entriesResponse && entriesResponse.pages ? entriesResponse.pages : 1;

    const prevLetter = adjacentLetter(railLetters, activeKey, -1);
    const nextLetter = adjacentLetter(railLetters, activeKey, 1);

    let listHTML = '';
    if (entriesFailed) {
      listHTML = inlineErrorHTML(`「${label}」下的词条加载失败。`);
    } else if (items.length === 0) {
      listHTML = emptyStateHTML({
        title: '此字母下暂无词条',
      });
    } else {
      listHTML = items.map((entry, index) => entryLineHTML(entry, index, activeKey)).join('');
    }

    const pagerHTML =
      !entriesFailed && totalPages > 1
        ? `<p class="letter-more">共 ${total} 条；受分页所限，此处先列前 ${items.length} 条。</p>`
        : '';

    ctx.mount.innerHTML = `
      <div class="browse-layout">
        ${letterRailHTML(railLetters, activeKey)}
        <section class="browse-main" aria-labelledby="browse-title">
          <div class="page-sheet browse-sheet">
            <header class="paper-page-head">
              <span>现代梗语词典</span>
              <span>${escapeHtml(isWestern ? '西文' : `词典正文 · ${label}`)}</span>
            </header>
            <div class="letter-head">
              <h1 class="letter-display" id="browse-title">${escapeHtml(label)}</h1>
              <p class="letter-count">共 ${escapeHtml(String(total))} 条</p>
            </div>
            <div class="entry-list">${listHTML}</div>
            ${pagerHTML}
            <footer class="paper-page-foot">
              <span>— ${escapeHtml(label)} —</span>
              <span>第 1 页</span>
            </footer>
          </div>
          <nav class="letter-step-nav" aria-label="相邻字母">
            ${
              prevLetter
                ? `<a class="letter-step" href="${browseHref(prevLetter.key)}"><span class="letter-step-dir">← 上一字母</span><span class="letter-step-key">${escapeHtml(prevLetter.label)}</span></a>`
                : '<span class="letter-step letter-step--disabled"><span class="letter-step-dir">← 上一字母</span><span class="letter-step-key">—</span></span>'
            }
            ${
              nextLetter
                ? `<a class="letter-step letter-step--next" href="${browseHref(nextLetter.key)}"><span class="letter-step-dir">下一字母 →</span><span class="letter-step-key">${escapeHtml(nextLetter.label)}</span></a>`
                : '<span class="letter-step letter-step--next letter-step--disabled"><span class="letter-step-dir">下一字母 →</span><span class="letter-step-key">—</span></span>'
            }
          </nav>
        </section>
      </div>
    `;

    ctx.mount.querySelectorAll('[data-inline-retry]').forEach((button) => {
      button.addEventListener('click', () => ctx.refresh());
    });

    if (entriesFailed) {
      showError(`「${label}」下的词条加载失败。`, () => ctx.refresh());
    } else if (metaFailed) {
      showError('检字表加载失败，字母计数可能不准确。', () => ctx.refresh());
    }
  },
};
