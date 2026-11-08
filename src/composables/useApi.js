import { getWebApp } from './useTelegram.js'

// --- 更新系リクエストの追跡 ---
// 楽観的更新（チェック・数量変更・追加・削除）は呼び出し元で await されないため、
// 直後にリスト一覧へ戻ると PATCH/POST の完了前に GET /api/lists が走り、古い集計が表示される。
// 進行中の更新系リクエストを覚えておき、一覧の再読み込み前に待てるようにする。
const pendingWrites = new Set()

function trackWrite(promise) {
  const tracked = promise.catch(() => {}).finally(() => { pendingWrites.delete(tracked) })
  pendingWrites.add(tracked)
  return promise
}

// 進行中の更新系リクエストが全て終わるまで待つ。
// 待っている間に新しい更新が始まることもあるので空になるまで繰り返す（暴走防止に上限あり）。
export async function settlePendingWrites(maxRounds = 5) {
  for (let i = 0; i < maxRounds && pendingWrites.size > 0; i++) {
    await Promise.all([...pendingWrites])
  }
}

async function rawRequest(method, path, body, extraHeaders = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
    body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('auth-required'))
    let msg = `HTTP ${res.status}`
    try { const data = await res.json(); if (data?.error) msg += `: ${data.error}` } catch {}
    const error = new Error(msg)
    error.status = res.status
    throw error
  }
  return res.status === 204 ? undefined : res.json()
}

function request(method, path, body, extraHeaders = {}) {
  const promise = rawRequest(method, path, body, extraHeaders)
  return method === 'GET' ? promise : trackWrite(promise)
}

export const api = {
  getPasskeys: () => request('GET', '/api/auth/passkeys'),
  deletePasskey: (id) => request('DELETE', `/api/auth/passkeys/${encodeURIComponent(id)}`),
  getPasskeyRegistrationOptions: () => request('POST', '/api/auth/passkeys/register/options'),
  verifyPasskeyRegistration: (credential, name) => request('POST', '/api/auth/passkeys/register/verify', { credential, name }),
  getPasskeyLoginOptions: () => request('POST', '/api/auth/passkeys/login/options'),
  verifyPasskeyLogin: (credential) => request('POST', '/api/auth/passkeys/login/verify', credential),
  loginAgent: (loginId, password) => request('POST', '/api/auth/password', { loginId, password }),
  getAgentAccounts: () => request('GET', '/api/accounts'),
  createAgentAccount: (data) => request('POST', '/api/accounts', data),
  revokeAgentAccount: (id) => request('DELETE', `/api/accounts/${id}`),
  deleteAgentAccount: (id) => request('DELETE', `/api/accounts/${id}/permanent`),
  getMe: () => request('GET', '/api/auth/me'),
  async loginTelegram() {
    let token
    try { token = JSON.parse(localStorage.getItem('gl_session'))?.token } catch {}
    const initData = getWebApp()?.initData
    if (!initData && !token) return
    const user = await request('POST', '/api/auth/telegram', undefined, {
      ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      ...(token ? { 'X-Session-Token': token } : {}),
    })
    try { localStorage.removeItem('gl_session') } catch {}
    return user
  },
  async logout() {
    await request('POST', '/api/auth/logout')
    try { localStorage.removeItem('gl_session') } catch {}
  },
  getLists: () => request('GET', '/api/lists'),
  createList: (name) => request('POST', '/api/lists', { name }),
  joinList: (shareCode) => request('POST', '/api/lists/join', { shareCode }),
  getList: (id) => request('GET', `/api/lists/${id}`),
  updateList: (id, name) => request('PATCH', `/api/lists/${id}`, { name }),
  deleteList: (id) => request('DELETE', `/api/lists/${id}`),
  archiveList: (id) => request('POST', `/api/lists/${id}/archive`),
  unarchiveList: (id) => request('POST', `/api/lists/${id}/unarchive`),
  leaveList: (id) => request('DELETE', `/api/lists/${id}/members/me`),
  getItems: (listId) => request('GET', `/api/lists/${listId}/items`),
  addItem: (listId, data) => request('POST', `/api/lists/${listId}/items`, typeof data === 'string' ? { name: data } : data),
  updateItem: (id, data) => request('PATCH', `/api/items/${id}`, data),
  deleteItem: (id) => request('DELETE', `/api/items/${id}`),
  getFavorites: () => request('GET', '/api/favorites'),
  addFavorite: (name, category) => request('POST', '/api/favorites', { name, category }),
  removeFavorite: (id) => request('DELETE', `/api/favorites/${id}`),
  async getItemAttachments(itemId) {
    return request('GET', `/api/items/${itemId}/attachments`)
  },
  async uploadItemAttachment(itemId, file) {
    const form = new FormData()
    form.append('file', file)
    return request('POST', `/api/items/${itemId}/attachments`, form)
  },
  async deleteAttachment(attachmentId) {
    return request('DELETE', `/api/attachments/${attachmentId}`)
  },
  getAttachmentUrl(attachmentId) {
    return `/api/attachments/${attachmentId}/download`
  },
  recategorize: (listId) => request('POST', `/api/lists/${listId}/recategorize`),
  uploadFile: async (listId, file) => {
    const form = new FormData()
    form.append('file', file)
    return request('POST', `/api/lists/${listId}/upload`, form)
  },
}
