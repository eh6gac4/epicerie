// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
function worker() {
  const handlers = {}
  const fallback = { offline: true }
  const caches = { match: vi.fn().mockResolvedValue(fallback) }
  const fetch = vi.fn().mockRejectedValue(new Error('offline'))
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://epicerie.eh6gac4.work' }, addEventListener: (name, fn) => { handlers[name] = fn } },
    URL, caches, fetch,
  })
  return { handle: handlers.fetch, caches, fetch, fallback }
}
describe('Service Worker privacy and offline fallback', () => {
  it('never handles auth, API, uploads, or third party requests', () => {
    const { handle, fetch, caches } = worker()
    for (const [path, method, mode] of [['/api/auth/me','GET','navigate'], ['/api/lists','GET','cors'], ['/api/files/id','GET','cors'], ['/api','GET','navigate'], ['/','POST','navigate'], ['https://telegram.org/sdk.js','GET','cors']]) {
      const respondWith = vi.fn()
      handle({ request: { url: new URL(path, 'https://epicerie.eh6gac4.work').href, method, mode }, respondWith })
      expect(respondWith).not.toHaveBeenCalled()
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(caches.match).not.toHaveBeenCalled()
  })
  it('serves a generic offline page for failed page navigation', async () => {
    const { handle, caches, fallback } = worker()
    let response
    handle({ request: { url: 'https://epicerie.eh6gac4.work/list/private-id', method: 'GET', mode: 'navigate' }, respondWith: value => { response = value } })
    expect(await response).toBe(fallback)
    expect(caches.match).toHaveBeenCalledWith('/offline.html')
  })
})
