/**
 * 表单通用逻辑：字段错误定位、本地校验、提交状态与表单级提示。
 */

/** 取得字段容器。 */
function fieldBox(form, name) {
  return form.querySelector(`[data-field="${name}"]`);
}

/** 清除全部字段错误。 */
export function clearFormErrors(form) {
  if (!form) return;
  form.querySelectorAll('.field.has-error').forEach((field) => field.classList.remove('has-error'));
  form.querySelectorAll('.field-error').forEach((node) => {
    node.textContent = '';
  });
}

/** 把服务端 fields 映射到对应输入框并聚焦第一个错误。 */
export function applyFieldErrors(form, fields) {
  if (!form || !fields || typeof fields !== 'object') return;
  let firstControl = null;
  Object.entries(fields).forEach(([name, message]) => {
    const box = fieldBox(form, name);
    if (!box) return;
    box.classList.add('has-error');
    const errorNode = box.querySelector('.field-error');
    if (errorNode) errorNode.textContent = String(message || '此项填写有误');
    const control = box.querySelector('input, textarea, select');
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      if (!firstControl) firstControl = control;
    }
  });
  if (firstControl) {
    firstControl.focus();
    if (firstControl.scrollIntoView) {
      firstControl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

/** 输入时自动清除该字段的错误提示。 */
export function bindFieldErrorClearing(form) {
  if (!form) return;
  form.addEventListener('input', (event) => {
    const control = event.target.closest('input, textarea, select');
    if (!control) return;
    const box = control.closest('.field');
    if (!box) return;
    box.classList.remove('has-error');
    const errorNode = box.querySelector('.field-error');
    if (errorNode) errorNode.textContent = '';
    control.removeAttribute('aria-invalid');
  });
}

/**
 * 本地校验。
 * @param {HTMLFormElement} form
 * @param {Array<{name:string, message:string, test:Function}>} rules
 */
export function validateForm(form, rules) {
  clearFormErrors(form);
  const errors = {};
  for (const rule of rules) {
    const control = form.elements.namedItem(rule.name);
    const value = control ? String(control.value || '') : '';
    let passed = false;
    try {
      passed = rule.test(value, form);
    } catch (error) {
      passed = false;
    }
    if (!passed) errors[rule.name] = rule.message;
  }
  if (Object.keys(errors).length > 0) {
    applyFieldErrors(form, errors);
    return { ok: false, errors };
  }
  return { ok: true, errors };
}

/** 表单级提示（非字段错误）。 */
export function setFormMessage(form, message, type = 'error') {
  if (!form) return;
  const node = form.querySelector('[data-form-message]');
  if (!node) return;
  node.textContent = message || '';
  node.className = `form-message form-message--${type}`;
  node.hidden = !message;
}

/** 提交按钮加载态。 */
export function setSubmitLoading(button, loading, labels = {}) {
  if (!button) return;
  const idleText = labels.idle || '保存';
  const loadingText = labels.loading || '保存中…';
  if (loading) {
    if (!button.dataset.idleText) button.dataset.idleText = button.textContent.trim() || idleText;
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = button.dataset.idleText || idleText;
  }
}

/** 字母下拉选项（自动推断 / A–Z / 西文）。 */
export function letterOptionsHTML(selected, { allowAuto = true } = {}) {
  const normalized = String(selected || '').trim();
  const selectedValue = normalized === '西文' || normalized.toLowerCase() === 'western'
    ? '西文'
    : normalized.toUpperCase();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const options = [];
  if (allowAuto) {
    options.push(`<option value=""${selectedValue ? '' : ' selected'}>自动推断（按拼音或字符）</option>`);
  }
  letters.forEach((letter) => {
    options.push(`<option value="${letter}"${selectedValue === letter ? ' selected' : ''}>${letter}</option>`);
  });
  options.push(
    `<option value="西文"${selectedValue === '西文' ? ' selected' : ''}>西文（单词或数字开头）</option>`
  );
  return options.join('');
}
