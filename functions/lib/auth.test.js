// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Hono } from 'hono'
import { generateSignedCookie } from 'hono/cookie'
import { auth, requireUser } from './auth.js'

const user = { id: -123, email: 'owner@example.com', name: 'Owner' }
function setup() {
  const statement = { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}), first: vi.fn().mockResolvedValue(user) }
  const env = { SESSION_SECRET: 'a'.repeat(64), APP_ORIGIN: 'https://shop.example', GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', DB: { prepare: vi.fn().mockReturnValue(statement) } }
  const app = new Hono()
  app.route('/api/auth', auth)
  app.use('*', requireUser)
  app.get('/api/lists', (c) => c.json({ userId: c.get('userId') }))
  return { app, env, statement }
}
function cookie(response) { return response.headers.get('set-cookie').split(';')[0] }
async function start(app, env, returnTo = '/list/abc') {
  const response = await app.request('/api/auth/google?returnTo=' + encodeURIComponent(returnTo), {}, env)
  const url = new URL(response.headers.get('location'))
  return { response, url, headers: { Cookie: cookie(response) } }
}
function googleResponses(profile = { sub: 'google-123', email: user.email, email_verified: true, name: user.name }) {
  return vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json({ access_token: 'google-token' }))
    .mockResolvedValueOnce(Response.json(profile))
}
afterEach(() => vi.restoreAllMocks())

describe('Google authentication', () => {
  it('rejects unauthenticated API requests, including old Telegram headers and tokens', async () => {
    const { app, env } = setup()
    const response = await app.request('/api/lists?session_token=old&init_data=old', { headers: { 'X-Telegram-Init-Data': 'old', 'X-Session-Token': 'old' } }, env)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('fails closed without a sufficiently long signing secret', async () => {
    const { app, env } = setup()
    expect((await app.request('/api/auth/google', {}, { ...env, SESSION_SECRET: 'short' })).status).toBe(503)
  })
  it('rejects expired signed sessions and users removed from the database', async () => {
    const { app, env, statement } = setup()
    const expired = await generateSignedCookie('epicerie_session', JSON.stringify({ userId: user.id, expiresAt: Date.now() - 1000 }), env.SESSION_SECRET)
    expect((await app.request('/api/lists', { headers: { Cookie: expired.split(';')[0] } }, env)).status).toBe(401)
    const valid = await generateSignedCookie('epicerie_session', JSON.stringify({ userId: user.id, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)
    statement.first.mockResolvedValue(null)
    expect((await app.request('/api/lists', { headers: { Cookie: valid.split(';')[0] } }, env)).status).toBe(401)
  })
  it('starts OAuth with state, PKCE and an HttpOnly secure cookie', async () => {
    const { app, env } = setup()
    const { response, url } = await start(app, env)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe('https://shop.example/api/auth/google/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(response.headers.get('set-cookie')).toMatch(/Secure/)
  })
  it('rejects missing or mismatched state without contacting Google', async () => {
    const { app, env } = setup()
    const { headers } = await start(app, env)
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await app.request('/api/auth/google/callback?code=code&state=wrong', { headers }, env)
    expect(response.headers.get('location')).toBe('/?auth_error=1')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('logs in, preserves legacy user IDs, protects API access, and clears the cookie on logout', async () => {
    const { app, env, statement } = setup()
    statement.first.mockResolvedValue({ ...user, id: 123456789 })
    const { headers, url } = await start(app, env, '/?startapp=ABC123')
    const fetchMock = googleResponses()
    const response = await app.request('/api/auth/google/callback?code=code&state=' + url.searchParams.get('state'), { headers }, env)
    expect(response.headers.get('location')).toBe('/?startapp=ABC123')
    expect(fetchMock.mock.calls[0][1].body.get('code_verifier')).toBeTruthy()
    const sessionCookie = response.headers.get('set-cookie').match(/epicerie_session=[^;]+/)[0]
    const sessionHeaders = { Cookie: sessionCookie }
    const me = await app.request('/api/auth/me', { headers: sessionHeaders }, env)
    expect((await me.json()).id).toBe(123456789)
    const lists = await app.request('/api/lists', { headers: sessionHeaders }, env)
    expect(await lists.json()).toEqual({ userId: 123456789 })
    const forbidden = await app.request('/api/auth/logout', { method: 'POST', headers: { ...sessionHeaders, Origin: 'https://attacker.example' } }, env)
    expect(forbidden.status).toBe(403)
    const logout = await app.request('/api/auth/logout', { method: 'POST', headers: { ...sessionHeaders, Origin: env.APP_ORIGIN } }, env)
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    const tampered = await app.request('/api/lists', { headers: { Cookie: sessionCookie + 'tampered' } }, env)
    expect(tampered.status).toBe(401)
  })
  it.each(['//attacker.example', '/\\attacker.example'])('does not redirect to an external return path %s', async (returnTo) => {
    const { app, env } = setup()
    const { headers, url } = await start(app, env, returnTo)
    googleResponses()
    const response = await app.request('/api/auth/google/callback?code=code&state=' + url.searchParams.get('state'), { headers }, env)
    expect(response.headers.get('location')).toBe('/')
  })
  it('rejects unverified Google email without creating a user or session', async () => {
    const { app, env } = setup()
    const { headers, url } = await start(app, env)
    googleResponses({ sub: 'google-123', email: user.email, email_verified: false })
    const response = await app.request('/api/auth/google/callback?code=code&state=' + url.searchParams.get('state'), { headers }, env)
    expect(response.headers.get('location')).toBe('/?auth_error=1')
    expect(env.DB.prepare).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).not.toContain('epicerie_session=')
  })
})

describe('Telegram authentication alongside Google', () => {
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
  it('allows either provider and rejects forged credentials when both are configured', async () => {
    const { app, env } = setup()
    env.TELEGRAM_BOT_TOKEN = '123456:' + 'b'.repeat(40)
    const headers = { 'X-Telegram-Init-Data': await launchData(env.TELEGRAM_BOT_TOKEN) }
    expect((await app.request('/api/auth/me', { headers }, env)).status).toBe(200)
    expect((await app.request('/api/auth/me', { headers: { 'X-Telegram-Init-Data': 'forged' } }, env)).status).toBe(401)
    expect((await start(app, env)).response.status).toBe(302)
  })
})
