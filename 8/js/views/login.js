/**
 * 验证界面：整页红金织纹底，左侧书名横匾，右侧竖版验证卡。
 * 姓名 + 8 位学号（202009 + 两位序号）通过后进入主站。
 */
import { login } from '../auth.js';
import { escapeHtml, qs } from '../utils.js';

export function renderLogin(mount, { onSuccess, message = '' } = {}) {
  mount.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <div class="gate-inner">
        <div class="gate-brand" aria-hidden="true">
          <p class="gate-brand-title">现代梗语词典</p>
          <p class="gate-brand-sub">东营市胜利第一中学高2020级九班 GYX 编</p>
        </div>

        <main class="gate-card">
          <form class="gate-form" novalidate>
            <h1 class="gate-title" id="gate-title">验证身份</h1>

            <label class="gate-field">
              <span class="gate-label">姓名</span>
              <input class="gate-input" name="name" type="text" autocomplete="name"
                maxlength="12" required>
            </label>

            <label class="gate-field">
              <span class="gate-label">学号</span>
              <input class="gate-input" name="student_id" type="text" inputmode="numeric"
                autocomplete="off" maxlength="8" required>
            </label>

            <p class="gate-error" data-gate-error role="alert" ${
              message ? '' : 'hidden'
            }>${escapeHtml(message)}</p>

            <button class="gate-submit" type="submit">进入词典</button>
          </form>
        </main>
      </div>
    </section>`;

  const form = qs('.gate-form', mount);
  const errorBox = qs('[data-gate-error]', mount);
  const submit = qs('.gate-submit', mount);
  const nameInput = qs('input[name="name"]', mount);
  const idInput = qs('input[name="student_id"]', mount);

  const showError = (text) => {
    errorBox.textContent = text;
    errorBox.hidden = !text;
  };

  const clearError = () => showError('');

  [nameInput, idInput].forEach((input) => {
    input.addEventListener('input', clearError);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const studentId = idInput.value.trim();
    if (!name) {
      showError('请输入姓名。');
      nameInput.focus();
      return;
    }
    if (!/^\d{8}$/.test(studentId)) {
      showError('学号应为 8 位数字，例如 20200907。');
      idInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = '验证中…';
    clearError();
    try {
      const data = await login(name, studentId);
      if (onSuccess) onSuccess(data && data.user);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showError((error && error.message) || '验证失败，请稍后重试。');
      idInput.focus();
      idInput.select();
    } finally {
      submit.disabled = false;
      submit.textContent = '进入词典';
    }
  });

  window.setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 30);
}
