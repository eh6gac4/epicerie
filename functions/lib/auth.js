import { createPasskeyRoutes } from './passkeys.js'
import { dataUser } from './sharedWorkspace.js'
import { authenticateAgentSession, verifyAgentLogin } from './agentAccounts.js'
import { Hono } from 'hono'
import { signSession, verifySession, validateInitData } from './telegramAuth.js'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'

export const auth = new Hono()
const SESSION = 'epicerie_session'
const DURATION = 30 * 24 * 60 * 60

function sessionSecret(c) { return c.env.SESSION_SECRET || c.env.TELEGRAM_BOT_TOKEN }
function options(c, maxAge) {
  return { httpOnly: true, secure: new URL(c.env.APP_ORIGIN || c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge }
}
function sameOrigin(c) {
  const origin = new URL(c.env.APP_ORIGIN || c.req.url).origin
  return c.req.header('Sec-Fetch-Site') !== 'cross-site' && (!c.req.header('Origin') || c.req.header('Origin') === origin)
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
  let result = initData ? await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN) : null
  if (!result?.valid && token) result = await verifySession(token, c.env.TELEGRAM_BOT_TOKEN)
  return result?.valid ? { id: result.userId, name: result.name || 'Telegram', provider: 'telegram' } : null
}
export async function requireUser(c, next) {
  c.header('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !sameOrigin(c)) return c.json({ error: 'Invalid origin' }, 403)
  const session = await readCookie(c, SESSION)
  if (session?.provider === 'agent') return authenticateAgentSession(c, session, next)
  let user = null
  if (Number.isSafeInteger(session?.userId)) {
    if (session.provider === 'telegram' && session.userId > 0) {
      user = { id: session.userId, name: session.name || 'Telegram', provider: 'telegram' }
    }
  }
  user ||= await telegramUser(c)
  if (user) user = await dataUser(c, user)
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  c.set('userId', user.id)
  c.set('user', user)
  return next()
}

auth.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  return next()
})

async function issueAccountSession(c, account) {
  const expiresAt = account.account_type === 'family' ? Date.now() + DURATION * 1000 : Math.min(Date.now() + DURATION * 1000, account.expires_at)
  await setSignedCookie(c, SESSION, JSON.stringify({ provider: 'agent', agentId: account.id, expiresAt }), sessionSecret(c), options(c, Math.floor((expiresAt - Date.now()) / 1000)))
}

auth.route('/passkeys', createPasskeyRoutes({ requireUser, issueAccountSession, sessionSecret, sameOrigin, cookieOptions: options }))

auth.post('/password', async (c) => {
  if (!sessionSecret(c) || sessionSecret(c).length < 32) return c.json({ error: 'Session signing is not configured' }, 503)
  if (!sameOrigin(c)) return c.json({ error: 'Invalid origin' }, 403)
  const result = await verifyAgentLogin(c)
  if (result.error) return c.json({ error: result.error }, result.status)
  await issueAccountSession(c, result.account)
  return c.json(result.user)
})

// Exchange Telegram launch data or an existing legacy session for an HttpOnly cookie.
auth.post('/telegram', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Invalid origin' }, 403)
  const account = await telegramUser(c)
  const user = account && await dataUser(c, account)
  if (!user || !sessionSecret(c)) return c.json({ error: 'Telegram authentication required' }, 401)
  await setSignedCookie(c, SESSION, JSON.stringify({ userId: user.accountId ?? user.id, name: user.name, provider: 'telegram', expiresAt: Date.now() + DURATION * 1000 }), sessionSecret(c), options(c, DURATION))
  return c.json(user)
})

// Keep the previous endpoint for already deployed Telegram clients.
auth.post('/session', requireUser, async (c) => {
  if (c.get('user').provider !== 'telegram' || !c.env.TELEGRAM_BOT_TOKEN) return c.json({ error: 'Telegram authentication required' }, 401)
  return c.json(await signSession(c.get('user').accountId ?? c.get('userId'), c.env.TELEGRAM_BOT_TOKEN))
})

auth.get('/me', requireUser, (c) => c.json(c.get('user')))
auth.post('/logout', requireUser, (c) => {
  deleteCookie(c, SESSION, options(c, 0))
  return c.json({ ok: true })
})
