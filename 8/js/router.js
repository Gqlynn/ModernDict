/**
 * 极简 hash 路由。
 * 路由格式：/entry/:id、/browse、'*'（兜底）。
 * 视图约定：{ async render(ctx) }，ctx 含 mount/params/query/signal/setTitle 等。
 */
import { scrollPageToTop, setPageTitle } from './utils.js';

const routes = [];
let mountElement = null;
let notFoundView = null;
let currentContext = null;
let currentController = null;
let onRouteChangeCallback = null;
let started = false;

/** 注册路由。pattern 用 :name 表示参数，'*' 为兜底。 */
export function defineRoute(pattern, view) {
  routes.push({ pattern, view, regex: compilePattern(pattern), keys: extractKeys(pattern) });
}

function extractKeys(pattern) {
  if (pattern === '*') return [];
  return pattern
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
}

function compilePattern(pattern) {
  if (pattern === '*') return null;
  const segments = pattern.split('/').filter(Boolean);
  const source = segments
    .map((segment) => {
      if (segment.startsWith(':')) return '([^/]+)';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^/${source}/?$`);
}

/** 解析 location.hash 为 { path, query, raw }。 */
export function parseHash(hash = window.location.hash) {
  let raw = String(hash || '').replace(/^#/, '');
  if (!raw) raw = '/';
  if (!raw.startsWith('/')) raw = `/${raw}`;
  const queryIndex = raw.indexOf('?');
  let path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const queryString = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const query = {};
  new URLSearchParams(queryString).forEach((value, key) => {
    query[key] = value;
  });
  return { path: path || '/', query, raw };
}

function matchRoute(path) {
  for (const route of routes) {
    if (route.pattern === '*') continue;
    const match = route.regex.exec(path);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { route, params };
  }
  if (notFoundView) return { route: { pattern: '*', view: notFoundView }, params: {} };
  return null;
}

export function navigate(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === target) {
    run();
    return;
  }
  window.location.hash = target;
}

/** 重新渲染当前路由（用于重试与同参数刷新）。 */
export function refresh() {
  run();
}

/** 当前路由信息。 */
export function currentRoute() {
  return currentContext ? { ...currentContext, mount: undefined, signal: undefined } : null;
}

async function run() {
  if (!started || !mountElement) return;
  const parsed = parseHash();
  const matched = matchRoute(parsed.path);

  if (currentController) currentController.abort();
  currentController = new AbortController();
  const controller = currentController;

  if (onRouteChangeCallback) {
    try {
      onRouteChangeCallback(parsed);
    } catch (error) {
      // 导航状态更新失败不应阻断页面渲染。
    }
  }

  scrollPageToTop();

  if (!matched) {
    mountElement.innerHTML = '<div class="page-message">此页未收录，请返回首页。</div>';
    return;
  }

  const ctx = {
    path: parsed.path,
    pattern: matched.route.pattern,
    raw: parsed.raw,
    params: matched.params,
    query: parsed.query,
    mount: mountElement,
    signal: controller.signal,
    setTitle(title) {
      setPageTitle(title);
    },
    navigate,
    refresh,
  };
  currentContext = ctx;
  ctx.setTitle('');

  try {
    await matched.route.view.render(ctx);
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.code === 20)) return;
    if (!controller.signal.aborted) {
      // 兜底错误页，避免白屏；具体错误文案由视图自行呈现时不会走到这里。
      const message =
        error && error.message ? String(error.message) : '页面加载出现未知问题。';
      mountElement.innerHTML = `
        <section class="error-page" role="alert">
          <p class="error-page-kicker">页面加载失败</p>
          <h1 class="error-page-title">此页暂时打不开</h1>
          <p class="error-page-message">${escapeForRoute(message)}</p>
          <div class="error-page-actions">
            <button type="button" class="btn btn-primary" id="route-error-retry">重试</button>
            <a class="btn btn-secondary" href="#/">返回首页</a>
          </div>
        </section>`;
      const retry = mountElement.querySelector('#route-error-retry');
      if (retry) retry.addEventListener('click', () => run());
    }
  }
}

function escapeForRoute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 启动路由。
 * @param {{mount:Element, notFound:object, onRouteChange?:Function}} options
 */
export function start({ mount, notFound, onRouteChange }) {
  mountElement = mount;
  notFoundView = notFound || null;
  onRouteChangeCallback = onRouteChange || null;
  started = true;
  window.addEventListener('hashchange', run);
  if (!window.location.hash) {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    } catch (error) {
      window.location.hash = '#/';
    }
  }
  run();
}
