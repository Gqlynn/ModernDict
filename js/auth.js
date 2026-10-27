/**
 * 前端验证状态：保存当前已验证的同学，供页面与顶栏使用。
 */
import { api } from './api.js';
import { clearSessionToken, setSessionToken } from './token.js';

let currentUser = null;

/** 当前已通过验证的同学（未验证为 null）。 */
export function getUser() {
  return currentUser;
}

/** 设置当前用户（登录或会话恢复时调用）。 */
export function setUser(user) {
  currentUser = user && user.name ? user : null;
  return currentUser;
}

/** 是否已通过验证。 */
export function isAuthenticated() {
  return Boolean(currentUser);
}

/** 欢迎语，如「欢迎，耿翌祥」。 */
export function welcomeText() {
  return currentUser ? `欢迎，${currentUser.name}` : '';
}

/** 读取服务端会话；返回 { authenticated, user }。 */
export async function loadSession(signal) {
  const data = await api.session(signal);
  setUser(data && data.authenticated ? data.user : null);
  return data || { authenticated: false };
}

/** 提交姓名与学号验证。失败时抛出 ApiError。 */
export async function login(name, studentId) {
  const data = await api.login({ name, student_id: studentId });
  setUser(data && data.user);
  // Cookie 之外在 localStorage 留一份 token：浏览器清 Cookie 后仍能自动登录
  if (data && data.token) setSessionToken(data.token);
  return data;
}

/** 退出验证。 */
export async function logout() {
  try {
    await api.logout();
  } finally {
    clearSessionToken();
    setUser(null);
  }
}
