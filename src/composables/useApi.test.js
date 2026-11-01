import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, settlePendingWrites } from './useApi.js'

beforeEach(() => { localStorage.clear(); delete window.Telegram })
afterEach(() => { vi.restoreAllMocks(); delete window.Telegram; localStorage.clear() })
describe('Telegram browser session exchange', () => {
  it('exchanges signed launch data once, then uses cookies for requests and attachments', async () => {
    window.Telegram = { WebApp: { initData: 'signed-launch' } }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 123 }) })
    await api.loginTelegram()
    expect(fetchMock.mock.calls[0][1].headers['X-Telegram-Init-Data']).toBe('signed-launch')
    await api.getLists()
    expect(fetchMock.mock.calls[1][1].headers['X-Telegram-Init-Data']).toBeUndefined()
    expect(fetchMock.mock.calls[1][1].credentials).toBe('same-origin')
    expect(api.getAttachmentUrl('attachment')).toBe('/api/attachments/attachment/download')
  })
  it('migrates an existing Telegram session and removes the local token only on success', async () => {
    localStorage.setItem('gl_session', JSON.stringify({ token: 'existing-session', expiresAt: Date.now() + 1000 }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 123 }) })
    await expect(api.loginTelegram()).rejects.toThrow('HTTP 401')
    expect(localStorage.getItem('gl_session')).toBeTruthy()
    await api.loginTelegram()
    expect(fetchMock.mock.calls[1][1].headers['X-Session-Token']).toBe('existing-session')
    expect(localStorage.getItem('gl_session')).toBeNull()
  })
  it('does not attempt Telegram authentication in a normal browser', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await api.loginTelegram()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data }
}

describe('settlePendingWrites', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('進行中の更新が終わるまで待つ', async () => {
    let resolvePatch
    const patchDone = vi.fn()

    vi.spyOn(globalThis, 'fetch').mockImplementation((_path, opts) => {
      if (opts.method === 'PATCH') {
        return new Promise(resolve => {
          resolvePatch = () => { patchDone(); resolve(jsonResponse({ ok: true })) }
        })
      }
      return Promise.resolve(jsonResponse([]))
    })

    // 呼び出し元が await しない楽観的更新を再現する
    api.updateItem('item-1', { checked: true })

    const settled = settlePendingWrites().then(() => 'settled')
    const raced = await Promise.race([settled, Promise.resolve('not-settled')])
    expect(raced).toBe('not-settled')
    expect(patchDone).not.toHaveBeenCalled()

    resolvePatch()
    expect(await settled).toBe('settled')
    expect(patchDone).toHaveBeenCalled()
  })

  it('更新が失敗しても待機は解除される', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('network')))
    api.updateItem('item-1', { checked: true }).catch(() => {})
    await expect(settlePendingWrites()).resolves.toBeUndefined()
  })

  it('GET は追跡しない', async () => {
    let resolveGet
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { resolveGet = () => resolve(jsonResponse([])) }))
    api.getLists()
    await expect(settlePendingWrites()).resolves.toBeUndefined()
    resolveGet()
  })
})
