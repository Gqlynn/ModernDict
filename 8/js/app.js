/**
 * 前端入口：先验证身份（姓名 + 学号），通过后初始化报头搜索、路由与全站组件。
 */
import { initBackToTop, bindSearchBox, clearError } from './components.js';
import { defineRoute, navigate, start } from './router.js';
import { escapeHtml, qs } from './utils.js';
import { getUser, loadSession, logout } from './auth.js';
import { initAbbrTooltip, loadAbbreviations } from './abbr.js';
import { renderLogin } from './views/login.js';
import homeView from './views/home.js';
import browseView from './views/browse.js';
import entryView from './views/entry.js';
import searchView from './views/search.js';
import articlesView from './views/articles.js';
import articleView from './views/article.js';
import adminView from './views/admin.js';
import articleFormView from './views/articleForm.js';
import aboutView from './views/about.js';
import notFoundView from './views/notFound.js';

defineRoute('/', homeView);
defineRoute('/browse', browseView);
defineRoute('/entry/:id', entryView);
defineRoute('/search', searchView);
defineRoute('/articles', articlesView);
defineRoute('/article/:id', articleView);
defineRoute('/admin', adminView);
defineRoute('/new-article', articleFormView);
defineRoute('/edit-article/:id', articleFormView);
defineRoute('/about', aboutView);

const NAV_BY_PREFIX = [
  { prefix: '/browse', nav: '/browse' },
  { prefix: '/entry', nav: '/browse' },
  { prefix: '/articles', nav: '/articles' },
  { prefix: '/article', nav: '/articles' },
  { prefix: '/new-article', nav: '/articles' },
  { prefix: '/edit-article', nav: '/articles' },
  { prefix: '/search', nav: '/search' },
  { prefix: '/admin', nav: '/admin' },
  { prefix: '/about', nav: '/about' },
];

let chromeReady = false;

function updateActiveNav(path) {
  const matched = NAV_BY_PREFIX.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`));
  document.querySelectorAll('.site-nav a[data-nav]').forEach((link) => {
    const isActive = matched ? link.dataset.nav === matched.nav : false;
    link.classList.toggle('is-active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function syncToolbarSearch(path, query) {
  const input = document.getElementById('global-search-input');
  if (!input) return;
  if (path === '/search') {
    input.value = query && query.q ? query.q : '';
  } else if (document.activeElement !== input) {
    input.value = '';
  }
}

function initToolbar() {
  const form = document.getElementById('global-search');
  if (form) {
    bindSearchBox(form, {
      onSubmit(keyword) {
        navigate(`/search?q=${encodeURIComponent(keyword)}`);
      },
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
    const isEditable =
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      (target && target.isContentEditable);
    if (isEditable) return;
    if (document.body.classList.contains('dialog-open')) return;
    if (document.body.classList.contains('gate-open')) return;
    const input = document.getElementById('global-search-input');
    if (input) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function initRouteWatcher() {
  start({
    mount: qs('#app'),
    notFound: notFoundView,
    onRouteChange(parsed) {
      clearError();
      updateActiveNav(parsed.path);
      syncToolbarSearch(parsed.path, parsed.query);
      if (document.body.classList.contains('dialog-open')) {
        document.body.classList.remove('dialog-open');
      }
    },
  });
}

/** 顶栏显示同学姓名与「退出验证」。 */
function renderAuthActions() {
  const holder = document.getElementById('auth-actions');
  if (!holder) return;
  const user = getUser();
  if (!user) {
    holder.innerHTML = '';
    return;
  }
  holder.innerHTML = `<span class="auth-user">欢迎，<strong>${escapeHtml(
    user.name
  )}</strong></span><button type="button" class="auth-logout" id="auth-logout">退出验证</button>`;
  const logoutButton = document.getElementById('auth-logout');
  if (logoutButton) logoutButton.addEventListener('click', handleLogout);
}

async function handleLogout() {
  try {
    await logout();
  } catch (error) {
    /* 本地状态已在 auth.logout 清理 */
  }
  showGate('已退出验证。');
}

/** 展示验证界面。 */
function showGate(message = '') {
  document.body.classList.add('gate-open');
  renderAuthActions();
  renderLogin(qs('#app'), {
    message,
    async onSuccess(user) {
      if (user && Number(user.class) === 9) {
        window.location.replace('../');
        return;
      }
      await loadAbbreviations();
      document.body.classList.remove('gate-open');
      initChrome();
      initAbbrTooltip();
      renderAuthActions();
      navigate('/');
    },
  });
}

/** 首次验证通过后初始化主站外壳（只执行一次）。 */
function initChrome() {
  if (chromeReady) return;
  chromeReady = true;
  initToolbar();
  initBackToTop();
  initRouteWatcher();
  renderAuthActions();

  // 会话过期时由 api.js 派发，重新加载进入验证界面
  window.addEventListener('mcd:auth-required', () => {
    if (!getUser()) return;
    try {
      window.sessionStorage.setItem('mcd_auth_notice', '验证已过期，请重新验证。');
    } catch (error) {
      /* ignore */
    }
    window.location.reload();
  });
}

async function boot() {
  document.body.classList.add('gate-open');
  let notice = '';
  try {
    notice = window.sessionStorage.getItem('mcd_auth_notice') || '';
    if (notice) window.sessionStorage.removeItem('mcd_auth_notice');
  } catch (error) {
    notice = '';
  }

  let session = null;
  try {
    session = await loadSession();
  } catch (error) {
    showGate('暂时无法连接服务器，请刷新页面后重试。');
    return;
  }

  if (!session.authenticated) {
    showGate(notice);
    return;
  }

  if (Number((session.user || {}).class || 9) !== 8) {
    window.location.replace('../');
    return;
  }

  await loadAbbreviations();
  document.body.classList.remove('gate-open');
  initChrome();
  initAbbrTooltip();
}

boot();
