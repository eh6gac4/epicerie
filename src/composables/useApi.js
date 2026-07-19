import { getWebApp } from './useTelegram.js'

// --- Session storage ---

const SESSION_KEY = 'gl_session'

function getStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.token || !s?.expiresAt) return null
    if (s.expiresAt <= Date.now()) { localStorage.removeItem(SESSION_KEY); return null }
    return s
  } catch { return null }
}

function setStoredSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
}

function clearStoredSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

export function hasValidStoredSession() {
  return getStoredSession() !== null
}

// --- Session creation ---

async function createSession() {
  const tg = getWebApp()
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData ?? '',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const session = await res.json()
  setStoredSession(session)
  return session
}

// --- HTTP requests ---

async function request(method, path, body, _retry = false) {
  const tg = getWebApp()
  const session = getStoredSession()
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': tg?.initData ?? '',
  }
  if (session) headers['X-Session-Token'] = session.token

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // On 401 with an (expired/invalid) session token, renew once and retry
  if (res.status === 401 && session && !_retry) {
    clearStoredSession()
    if (tg?.initData) {
      try {
        await createSession()
        return request(method, path, body, true)
      } catch { /* fall through to error below */ }
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const d = await res.json()
      if (d?.error) msg += `: ${d.error}`
    } catch { /* ignore */ }
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  if (res.status === 204) return undefined
  return res.json()
}

export const api = {
  createSession,
  getLists: () => request('GET', '/api/lists'),
  createList: (name) => request('POST', '/api/lists', { name }),
  joinList: (shareCode) => request('POST', '/api/lists/join', { shareCode }),
  getList: (id) => request('GET', `/api/lists/${id}`),
  deleteList: (id) => request('DELETE', `/api/lists/${id}`),
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
    const tg = getWebApp()
    const session = getStoredSession()
    const headers = { 'X-Telegram-Init-Data': tg?.initData ?? '' }
    if (session) headers['X-Session-Token'] = session.token
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/items/${itemId}/attachments`, { method: 'POST', headers, body: formData })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  async deleteAttachment(attachmentId) {
    return request('DELETE', `/api/attachments/${attachmentId}`)
  },
  getAttachmentUrl(attachmentId) {
    const tg = getWebApp()
    const session = getStoredSession()
    const url = new URL(`/api/attachments/${attachmentId}/download`, window.location.origin)
    if (session) {
      url.searchParams.set('session_token', session.token)
    } else if (tg?.initData) {
      url.searchParams.set('init_data', tg.initData)
    }
    return url.pathname + url.search + url.hash
  },
  recategorize: (listId) => request('POST', `/api/lists/${listId}/recategorize`),
  uploadFile: async (listId, file) => {
    const tg = getWebApp()
    const session = getStoredSession()
    const headers = { 'X-Telegram-Init-Data': tg?.initData ?? '' }
    if (session) headers['X-Session-Token'] = session.token
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/lists/${listId}/upload`, { method: 'POST', headers, body: formData })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try { const d = await res.json(); if (d?.error) msg += `: ${d.error}` } catch {}
      throw new Error(msg)
    }
    return res.json()
  },
}
