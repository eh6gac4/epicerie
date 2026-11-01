import { Hono } from 'hono'
import { signSession, verifySession, validateInitData } from './telegramAuth.js'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'

export const auth = new Hono()
const SESSION = 'epicerie_session'
const OAUTH = 'epicerie_oauth'
const DURATION = 30 * 24 * 60 * 60

function configured(c) {
  return c.env.SESSION_SECRET?.length >= 32 && c.env.APP_ORIGIN
}
function sessionSecret(c) { return c.env.SESSION_SECRET || c.env.TELEGRAM_BOT_TOKEN }
function options(c, maxAge) {
  return { httpOnly: true, secure: new URL(c.env.APP_ORIGIN || c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge }
}
function returnPath(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value) ? value : '/'
}
async function readCookie(c, name) {
  try {
    const value = await getSignedCookie(c, sessionSecret(c), name)
    const data = value && JSON.parse(value)
    return data?.expiresAt > Date.now() ? data : null
  } catch { return null }
}
async function telegramUser(c) {
  if (!c.env.TELEGRAM_BOT_TOKEN) return null
  const token = c.req.header('X-Session-Token') || c.req.query('session_token')
  const initData = c.req.header('X-Telegram-Init-Data') || c.req.query('init_data')
  let result = token ? await verifySession(token, c.env.TELEGRAM_BOT_TOKEN) : null
  if (!result?.valid && initData) result = await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN)
  return result?.valid ? { id: result.userId, name: result.name || 'Telegram', provider: 'telegram' } : null
}
export async function requireUser(c, next) {
  c.header('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = new URL(c.env.APP_ORIGIN || c.req.url).origin
    if (c.req.header('Sec-Fetch-Site') === 'cross-site' ||
        (c.req.header('Origin') && c.req.header('Origin') !== origin)) {
      return c.json({ error: 'Invalid origin' }, 403)
    }
  }
  const session = await readCookie(c, SESSION)
  let user = null
  if (Number.isSafeInteger(session?.userId)) {
    user = session.provider === 'telegram' && session.userId > 0
      ? { id: session.userId, name: session.name || 'Telegram', provider: 'telegram' }
      : await c.env.DB.prepare('SELECT id, email, name FROM app_users WHERE id = ?').bind(session.userId).first()
  }
  user ||= await telegramUser(c)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  c.set('userId', user.id)
  c.set('user', user)
  return next()
}

auth.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  return next()
})

// Exchange Telegram launch data or an existing legacy session for an HttpOnly cookie.
auth.post('/telegram', requireUser, async (c) => {
  const user = c.get('user')
  if (user.provider !== 'telegram' || !sessionSecret(c)) return c.json({ error: 'Telegram authentication required' }, 401)
  await setSignedCookie(c, SESSION, JSON.stringify({ userId: user.id, name: user.name, provider: 'telegram', expiresAt: Date.now() + DURATION * 1000 }), sessionSecret(c), options(c, DURATION))
  return c.json(user)
})

// Keep the previous endpoint for already deployed Telegram clients.
auth.post('/session', requireUser, async (c) => {
  if (c.get('user').provider !== 'telegram' || !c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Telegram authentication required' }, 401)
  return c.json(await signSession(c.get('userId'), c.env.TELEGRAM_BOT_TOKEN))
})

auth.get('/google', async (c) => {
  if (!configured(c) || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.json({ error: 'Google login is not configured' }, 503)
  const state = crypto.randomUUID()
  const verifier = crypto.randomUUID() + crypto.randomUUID()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await setSignedCookie(c, OAUTH, JSON.stringify({ state, verifier, returnTo: returnPath(c.req.query('returnTo')), expiresAt: Date.now() + 600_000 }), c.env.SESSION_SECRET, options(c, 600))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL('/api/auth/google/callback', c.env.APP_ORIGIN).href,
    response_type: 'code', scope: 'openid email profile', state,
    code_challenge: challenge, code_challenge_method: 'S256',
  }).toString()
  return c.redirect(url.href)
})

auth.get('/google/callback', async (c) => {
  if (!configured(c) || !c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return c.json({ error: 'Google login is not configured' }, 503)
  const flow = await readCookie(c, OAUTH)
  deleteCookie(c, OAUTH, options(c, 0))
  if (!flow || flow.state !== c.req.query('state') || !c.req.query('code') || c.req.query('error')) return c.redirect('/?auth_error=1')
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: c.req.query('code'), client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET, grant_type: 'authorization_code',
        redirect_uri: new URL('/api/auth/google/callback', c.env.APP_ORIGIN).href, code_verifier: flow.verifier }),
    })
    if (!response.ok) throw new Error('Token exchange failed')
    const tokens = await response.json()
    if (!tokens.access_token) throw new Error('Missing access token')
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })
    if (!info.ok) throw new Error('User lookup failed')
    const profile = await info.json()
    if (typeof profile.sub !== 'string' || !profile.sub || profile.email_verified !== true || !profile.email) throw new Error('Unverified account')
    // Negative IDs avoid collisions with existing positive Telegram user IDs.
    const bytes = crypto.getRandomValues(new Uint32Array(2))
    const id = -(bytes[0] * 0x100000 + (bytes[1] & 0xfffff) + 1)
    await c.env.DB.prepare(`INSERT INTO app_users (id, google_sub, email, name) VALUES (?, ?, ?, ?)
      ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name`)
      .bind(id, profile.sub, profile.email, profile.name || '').run()
    const user = await c.env.DB.prepare('SELECT id FROM app_users WHERE google_sub = ?').bind(profile.sub).first()
    await setSignedCookie(c, SESSION, JSON.stringify({ userId: user.id, expiresAt: Date.now() + DURATION * 1000 }), c.env.SESSION_SECRET, options(c, DURATION))
    return c.redirect(returnPath(flow.returnTo))
  } catch {
    return c.redirect('/?auth_error=1')
  }
})

auth.get('/me', requireUser, (c) => c.json(c.get('user')))
auth.post('/logout', requireUser, (c) => {
  deleteCookie(c, SESSION, options(c, 0))
  return c.json({ ok: true })
})
