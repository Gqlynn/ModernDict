/**
 * 登录凭证的本地保存：Cookie 之外再存一份签名 token。
 * 浏览器关闭时清 Cookie、但保留站点数据的情况下，重开仍可自动登录。
 */
const TOKEN_KEY = 'mcd_session_token';

export function getSessionToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch (error) {
    return '';
  }
}

export function setSessionToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    /* localStorage 不可用时静默降级为仅 Cookie */
  }
}

export function clearSessionToken() {
  setSessionToken('');
}
