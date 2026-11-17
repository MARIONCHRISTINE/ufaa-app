// Small fetch wrapper for the FastAPI backend. The login token lives in localStorage and is sent
// as a Bearer header, so file downloads also go through fetch (never a token in a URL).

const TOKEN_KEY = 'ufaa_token';
const NOTICE_KEY = 'ufaa_login_notice';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function takeLoginNotice() {
  try {
    const msg = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return msg;
  } catch {
    return null;
  }
}

function buildUrl(path, params) {
  const url = new URL(`/api${path}`, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url;
}

async function errorMessage(res) {
  try {
    const data = await res.json();
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return data.detail[0].msg;
    return data.message || res.statusText;
  } catch {
    return res.statusText || `Request failed (${res.status})`;
  }
}

export async function api(path, { method = 'GET', body, params, form, raw = false, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(buildUrl(path, params), { method, headers, body: payload, signal });

  if (res.status === 401 && path !== '/auth/login') {
    const msg = await errorMessage(res);
    setToken(null);
    try {
      sessionStorage.setItem(NOTICE_KEY, msg);
    } catch {
      /* ignore */
    }
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    throw new ApiError(msg, 401);
  }
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  return raw ? res : res.json();
}

function filenameFrom(res, fallback) {
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return m ? decodeURIComponent(m[1]) : fallback;
}

/** Fetch a file with the login token and save it to the user's computer. */
export async function downloadFile(path, params, fallbackName = 'download') {
  const res = await api(path, { params, raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFrom(res, fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Fetch a file with the login token and show it in a new tab (PDFs, images). */
export async function openFile(path) {
  const win = window.open('', '_blank');
  try {
    const res = await api(path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
