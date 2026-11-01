import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './useApi.js'

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
