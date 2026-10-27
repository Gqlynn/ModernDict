/**
 * 文章表单：#/new-article、#/edit-article/:id
 * 分类下拉、Markdown 文本域、实时字数、校验与保存跳转。
 */
import { api, ApiError, isAbortError } from '../api.js';
import { clearError, skeletonHTML, toast } from '../components.js';
import {
  applyFieldErrors,
  bindFieldErrorClearing,
  setFormMessage,
  setSubmitLoading,
  validateForm,
} from '../forms.js';
import { escapeHtml, qs, countChars, trimText } from '../utils.js';

const FALLBACK_CATEGORIES = [
  { key: 'front', label: '卷首' },
  { key: 'appendix', label: '附录' },
  { key: 'afterword', label: '后记' },
  { key: 'archive', label: '版本档案' },
];

function categoryOptionsHTML(categories, selected) {
  const options = ['<option value="">请选择分类</option>'];
  categories.forEach((category) => {
    const isSelected = category.key === selected;
    options.push(
      `<option value="${escapeHtml(category.key)}"${isSelected ? ' selected' : ''}>${escapeHtml(
        category.label
      )}</option>`
    );
  });
  return options.join('');
}

function formHTML(article, editing, categories, defaultAuthor) {
  const title = editing ? '修订文章' : '新增文章';
  const submitText = editing ? '保存修改' : '收入文集';
  const content = article.content || '';
  return `<div class="form-page">
    <nav class="breadcrumb" aria-label="面包屑">
      <a href="#/">首页</a>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <a href="#/admin">编纂台</a>
      <span class="breadcrumb-sep" aria-hidden="true">/</span>
      <span class="breadcrumb-current" aria-current="page">${title}</span>
    </nav>
    <header class="form-head">
      <p class="eyebrow">编纂台 · 文章</p>
      <h1 class="form-title">${editing ? `修订《${escapeHtml(article.title || '')}》` : '为文集增补一篇'}</h1>
    </header>
    <form class="article-form paper-card" novalidate>
      <p class="form-message" data-form-message hidden></p>
      <div class="field field--wide" data-field="title">
        <label class="field-label" for="article-title">标题<span class="required">必填</span></label>
        <input id="article-title" name="title" type="text" maxlength="120" autocomplete="off"
          value="${escapeHtml(article.title || '')}" placeholder="如：封校纪实">
        <p class="field-error" data-error-for="title"></p>
      </div>
      <div class="field field--wide" data-field="subtitle">
        <label class="field-label" for="article-subtitle">副题<span class="optional">选填</span></label>
        <input id="article-subtitle" name="subtitle" type="text" maxlength="120" autocomplete="off"
          value="${escapeHtml(article.subtitle || '')}" placeholder="如：附录二">
        <p class="field-error" data-error-for="subtitle"></p>
      </div>
      <div class="form-row form-row--three">
        <div class="field" data-field="category">
          <label class="field-label" for="article-category">分类<span class="required">必填</span></label>
          <select id="article-category" name="category">${categoryOptionsHTML(
            categories,
            article.category || ''
          )}</select>
          <p class="field-error" data-error-for="category"></p>
        </div>
        <div class="field" data-field="author">
          <label class="field-label" for="article-author">作者<span class="optional">选填</span></label>
          <input id="article-author" name="author" type="text" maxlength="60" autocomplete="off"
            value="${escapeHtml(article.author || defaultAuthor || '')}" placeholder="如：GYX">
          <p class="field-error" data-error-for="author"></p>
        </div>
        <div class="field" data-field="sort_order">
          <label class="field-label" for="article-sort">排序<span class="optional">选填</span></label>
          <input id="article-sort" name="sort_order" type="number" step="1" min="0" max="9999"
            value="${escapeHtml(String(article.sort_order !== undefined ? article.sort_order : 100))}">
          <p class="field-error" data-error-for="sort_order"></p>
        </div>
      </div>
      <div class="field field--wide" data-field="content">
        <div class="field-label-row">
          <label class="field-label" for="article-content">正文<span class="required">必填</span></label>
          <span class="char-counter" data-char-counter>当前 0 字</span>
        </div>
        <textarea id="article-content" name="content" rows="20" spellcheck="false"
          placeholder="在此书写正文。段落之间空一行；可另起一行写 ## 小标题。">${escapeHtml(content)}</textarea>
        <p class="field-error" data-error-for="content"></p>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${submitText}</button>
        <button type="button" class="btn btn-secondary" data-cancel>放弃修改</button>
        ${
          editing
            ? `<a class="btn btn-ghost" href="#/article/${encodeURIComponent(article.id)}">查看本文 →</a>`
            : ''
        }
      </div>
    </form>
  </div>`;
}

export default {
  async render(ctx) {
    clearError();
    const editing = ctx.pattern === '/edit-article/:id';
    const articleId = editing ? ctx.params.id : null;
    ctx.setTitle(editing ? '修订文章' : '新增文章');

    let article = {};
    let meta = null;
    if (editing) {
      ctx.mount.innerHTML = skeletonHTML('form');
      const [articleResult, metaResult] = await Promise.allSettled([
        api.article(articleId, ctx.signal),
        api.meta(ctx.signal),
      ]);
      if (ctx.signal.aborted) return;
      if (articleResult.status === 'rejected') {
        if (isAbortError(articleResult.reason)) return;
        const notFound =
          articleResult.reason instanceof ApiError && articleResult.reason.status === 404;
        ctx.mount.innerHTML = `<section class="entry-error" role="alert">
          <p class="entry-error-kicker">${notFound ? '未收此篇' : '连接中断'}</p>
          <h1 class="entry-error-title">${notFound ? '此篇未收录' : '文章暂时打不开'}</h1>
          <p class="entry-error-message">${escapeHtml(
            notFound ? '要修订的文章不存在，可能已被删除。' : articleResult.reason.message
          )}</p>
          <div class="entry-error-actions">
            <a class="btn btn-primary" href="#/admin">返回编纂台</a>
            <a class="btn btn-secondary" href="#/articles">返回文集</a>
          </div>
        </section>`;
        return;
      }
      article = (articleResult.value && articleResult.value.article) || {};
      meta = metaResult.status === 'fulfilled' ? metaResult.value : null;
      ctx.setTitle(`修订《${article.title || '文章'}》`);
    } else {
      ctx.mount.innerHTML = skeletonHTML('form');
      try {
        meta = await api.meta(ctx.signal);
      } catch (error) {
        if (isAbortError(error)) return;
        meta = null;
      }
      if (ctx.signal.aborted) return;
    }

    const categories =
      meta && Array.isArray(meta.categories) && meta.categories.length
        ? meta.categories
        : FALLBACK_CATEGORIES;
    const defaultAuthor = meta && meta.book ? meta.book.compiler || 'GYX' : 'GYX';

    ctx.mount.innerHTML = formHTML(article, editing, categories, defaultAuthor);
    const form = qs('.article-form', ctx.mount);
    const submitButton = qs('button[type="submit"]', form);
    const submitText = editing ? '保存修改' : '收入文集';
    const contentField = qs('textarea[name="content"]', form);
    const counter = qs('[data-char-counter]', form);

    const updateCounter = () => {
      if (!counter || !contentField) return;
      counter.textContent = `当前 ${countChars(contentField.value)} 字`;
    };
    updateCounter();
    if (contentField) contentField.addEventListener('input', updateCounter);
    bindFieldErrorClearing(form);

    const cancelButton = qs('[data-cancel]', form);
    if (cancelButton) {
      cancelButton.addEventListener('click', () => {
        ctx.navigate(editing ? `/article/${encodeURIComponent(articleId)}` : '/admin');
      });
    }

    if (contentField) {
      contentField.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
        }
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFormMessage(form, '');
      const values = {
        title: trimText(form.elements.title.value),
        subtitle: trimText(form.elements.subtitle.value),
        category: trimText(form.elements.category.value),
        author: trimText(form.elements.author.value),
        content: trimText(contentField.value),
      };
      const rawSort = trimText(form.elements.sort_order.value);
      const sortOrder = rawSort === '' ? 100 : Number(rawSort);
      const check = validateForm(form, [
        { name: 'title', message: '请填写文章标题。', test: (value) => value.length > 0 },
        { name: 'title', message: '标题不要超过 120 个字。', test: (value) => value.length <= 120 },
        { name: 'category', message: '请选择文章分类。', test: (value) => value.length > 0 },
        { name: 'content', message: '请填写文章正文。', test: (value) => value.length > 0 },
        {
          name: 'sort_order',
          message: '排序需为 0 到 9999 之间的整数。',
          test: () => rawSort === '' || (Number.isInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 9999),
        },
      ]);
      if (!check.ok) return;

      const payload = {
        title: values.title,
        subtitle: values.subtitle,
        category: values.category,
        author: values.author,
        sort_order: sortOrder,
        content: values.content,
      };

      setSubmitLoading(submitButton, true, { idle: submitText, loading: '保存中…' });
      try {
        const response = editing
          ? await api.updateArticle(articleId, payload)
          : await api.createArticle(payload);
        const saved = response && response.article ? response.article : null;
        toast('已更新文集');
        const target = saved && saved.id !== undefined ? saved.id : articleId || '';
        ctx.navigate(`/article/${encodeURIComponent(target)}`);
      } catch (error) {
        if (isAbortError(error)) return;
        setSubmitLoading(submitButton, false, { idle: submitText });
        if (error instanceof ApiError && error.fields && Object.keys(error.fields).length) {
          applyFieldErrors(form, error.fields);
          setFormMessage(form, '有字段未通过校验，请按红色提示修改。');
        } else {
          setFormMessage(form, error.message || '保存失败，请稍后重试。');
        }
      }
    });
  },
};
