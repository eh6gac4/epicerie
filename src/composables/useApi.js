async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
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

export const api = {
  getMe: () => request('GET', '/api/auth/me'),
  logout: () => request('POST', '/api/auth/logout'),
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
