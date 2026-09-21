import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, settlePendingWrites } from './useApi.js'

vi.mock('./useTelegram.js', () => ({
  getWebApp: () => ({ initData: 'init-data' }),
}))

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

    vi.stubGlobal('fetch', vi.fn((_path, opts) => {
      if (opts.method === 'PATCH') {
        return new Promise(resolve => {
          resolvePatch = () => { patchDone(); resolve(jsonResponse({ ok: true })) }
        })
      }
      return Promise.resolve(jsonResponse([]))
    }))

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
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
    api.updateItem('item-1', { checked: true }).catch(() => {})
    await expect(settlePendingWrites()).resolves.toBeUndefined()
  })

  it('GET は追跡しない', async () => {
    let resolveGet
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveGet = () => resolve(jsonResponse([])) })))
    api.getLists()
    await expect(settlePendingWrites()).resolves.toBeUndefined()
    resolveGet()
  })
})
