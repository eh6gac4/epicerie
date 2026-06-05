import { getWebApp } from './useTelegram.js'

async function request(method, path, body) {
  const tg = getWebApp()
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': tg?.initData ?? '',
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
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
  getLists: () => request('GET', '/api/lists'),
  createList: (name) => request('POST', '/api/lists', { name }),
  joinList: (shareCode) => request('POST', '/api/lists/join', { shareCode }),
  getList: (id) => request('GET', `/api/lists/${id}`),
  deleteList: (id) => request('DELETE', `/api/lists/${id}`),
  getItems: (listId) => request('GET', `/api/lists/${listId}/items`),
  addItem: (listId, name) => request('POST', `/api/lists/${listId}/items`, { name }),
  updateItem: (id, data) => request('PATCH', `/api/items/${id}`, data),
  deleteItem: (id) => request('DELETE', `/api/items/${id}`),
}
