// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Hono } from 'hono'
import { generateSignedCookie } from 'hono/cookie'
import { auth, requireUser } from './auth.js'

const user = { id: -123, email: 'owner@example.com', name: 'Owner' }
function setup() {
  const statement = { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}), first: vi.fn().mockResolvedValue(user) }
  const env = { SESSION_SECRET: 'a'.repeat(64), APP_ORIGIN: 'https://shop.example', DB: { prepare: vi.fn().mockReturnValue(statement) } }
  const app = new Hono()
  app.route('/api/auth', auth)
  app.use('*', requireUser)
  app.get('/api/lists', (c) => c.json({ userId: c.get('userId') }))
  return { app, env, statement }
}
function cookie(response) { return response.headers.get('set-cookie').split(';')[0] }
afterEach(() => vi.restoreAllMocks())

describe('Browser session authentication', () => {
  it('rejects unauthenticated requests and disables response caching', async () => {
    const { app, env } = setup()
    const response = await app.request('/api/lists', {}, env)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('rejects expired, tampered and former Google sessions', async () => {
    const { app, env } = setup()
    for (const payload of [
      { provider: 'telegram', userId: 123, expiresAt: Date.now() - 1000 },
      { provider: 'google', userId: -123, expiresAt: Date.now() + 60_000 },
      { userId: -123, expiresAt: Date.now() + 60_000 },
    ]) {
      const value = await generateSignedCookie('epicerie_session', JSON.stringify(payload), env.SESSION_SECRET)
      expect((await app.request('/api/lists', { headers: { Cookie: value.split(';')[0] } }, env)).status).toBe(401)
    }
    const value = await generateSignedCookie('epicerie_session', JSON.stringify({ provider: 'telegram', userId: 123, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)
    expect((await app.request('/api/lists', { headers: { Cookie: value.split(';')[0] + 'tampered' } }, env)).status).toBe(401)
  })
  it('does not start Google OAuth or issue OAuth cookies', async () => {
    const { app, env } = setup()
    const response = await app.request('/api/auth/google', {}, env)
    expect(response.status).not.toBe(302)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})

describe('Telegram authentication', () => {
  async function launchData(botToken, overrides = {}) {
    const { createHmac } = await import('node:crypto')
    const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 123456789, first_name: 'Telegram Owner' }), ...overrides })
    const data = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
    const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
    params.set('hash', createHmac('sha256', secret).update(data).digest('hex'))
    return params.toString()
  }
  function telegramSetup() {
    const { app, env } = setup()
    // Existing Telegram installations need neither Google settings nor app_users.
    return { app, env: { TELEGRAM_BOT_TOKEN: '123456:' + 'b'.repeat(40), DB: env.DB } }
  }
  it('exchanges Telegram initData for a cookie without Google config and retains the existing user ID', async () => {
    const { app, env } = telegramSetup()
    const initData = await launchData(env.TELEGRAM_BOT_TOKEN)
    const response = await app.request('https://shop.example/api/auth/telegram', { method: 'POST', headers: { 'X-Telegram-Init-Data': initData, Origin: 'https://shop.example' } }, env)
    expect(response.status).toBe(200)
    expect((await response.json()).id).toBe(123456789)
    const headers = { Cookie: cookie(response) }
    const me = await app.request('https://shop.example/api/auth/me', { headers }, env)
    expect(await me.json()).toEqual({ id: 123456789, name: 'Telegram Owner', provider: 'telegram' })
    expect(env.DB.prepare).not.toHaveBeenCalled()
    expect((await app.request('https://shop.example/api/lists', { headers }, env)).status).toBe(200)
    expect((await app.request('https://shop.example/api/auth/logout', { method: 'POST', headers }, env)).headers.get('set-cookie')).toContain('Max-Age=0')
  })
  it('retains legacy session issuance, headers and attachment query authentication', async () => {
    const { app, env } = telegramSetup()
    const headers = { 'X-Telegram-Init-Data': await launchData(env.TELEGRAM_BOT_TOKEN) }
    const response = await app.request('/api/auth/session', { method: 'POST', headers }, env)
    expect(response.status).toBe(200)
    const { token } = await response.json()
    const lists = await app.request('/api/lists', { headers: { 'X-Session-Token': token } }, env)
    expect(await lists.json()).toEqual({ userId: 123456789 })
    expect((await app.request('/api/lists?session_token=' + encodeURIComponent(token), {}, env)).status).toBe(200)
    const exchanged = await app.request('/api/auth/telegram', { method: 'POST', headers: { 'X-Session-Token': token } }, env)
    expect(exchanged.status).toBe(200)
  })
  it('rejects tampered, stale and future launch data', async () => {
    const { app, env } = telegramSetup()
    for (const initData of [
      (await launchData(env.TELEGRAM_BOT_TOKEN)).replace('123456789', '987654321'),
      await launchData(env.TELEGRAM_BOT_TOKEN, { auth_date: String(Math.floor(Date.now() / 1000) - 86401) }),
      await launchData(env.TELEGRAM_BOT_TOKEN, { auth_date: String(Math.floor(Date.now() / 1000) + 120) }),
    ]) {
      expect((await app.request('/api/auth/telegram', { method: 'POST', headers: { 'X-Telegram-Init-Data': initData } }, env)).status).toBe(401)
    }
    expect(env.DB.prepare).not.toHaveBeenCalled()
  })
  it('accepts valid Telegram credentials and rejects forged credentials', async () => {
    const { app, env } = setup()
    env.TELEGRAM_BOT_TOKEN = '123456:' + 'b'.repeat(40)
    const headers = { 'X-Telegram-Init-Data': await launchData(env.TELEGRAM_BOT_TOKEN) }
    expect((await app.request('/api/auth/me', { headers }, env)).status).toBe(200)
    expect((await app.request('/api/auth/me', { headers: { 'X-Telegram-Init-Data': 'forged' } }, env)).status).toBe(401)
  })
})
