import { Hono } from 'hono'
import { Buffer } from 'node:buffer'
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie'
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getActiveFamilyAccount } from './agentAccounts.js'

const COOKIE = 'epicerie_passkey_challenge'
const TTL = 300_000
const encode = value => Buffer.from(value).toString('base64url')
const invalid = c => c.json({ error: 'パスキーを確認できませんでした。もう一度お試しください' }, 400)

export function createPasskeyRoutes({ requireUser, issueAccountSession, sessionSecret, sameOrigin, cookieOptions }) {
  const routes = new Hono()
  const options = c => ({ ...cookieOptions(c, TTL / 1000), path: '/api/auth/passkeys' })
  const rp = c => {
    const url = new URL(c.env.APP_ORIGIN || c.req.url)
    return { origin: url.origin, id: url.hostname }
  }
  routes.use('*', async (c, next) => {
    if (sessionSecret(c)?.length < 32 || !sessionSecret(c)) return c.json({ error: 'Session signing is not configured' }, 503)
    if (!sameOrigin(c)) return c.json({ error: 'Invalid origin' }, 403)
    const { origin } = rp(c)
    if (!origin.startsWith('https://') && !['localhost', '127.0.0.1'].includes(rp(c).id)) return c.json({ error: 'HTTPSが必要です' }, 503)
    if (c.req.method === 'POST') {
      // Bound unauthenticated challenge creation and verification work per IP.
      const bucket = encode(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('passkeys:' + (c.req.header('CF-Connecting-IP') || 'local'))))
      const now = Date.now()
      await c.env.DB.prepare('DELETE FROM agent_login_attempts WHERE window_start < ?').bind(now - 86_400_000).run()
      const attempt = await c.env.DB.prepare(`INSERT INTO agent_login_attempts (bucket, attempts, window_start) VALUES (?, 1, ?)
        ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
        window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING attempts`)
        .bind(bucket, now, now - 900_000, now - 900_000).first()
      if (attempt.attempts > 100) { c.header('Retry-After', '900'); return c.json({ error: '試行回数が多すぎます。15分後にお試しください' }, 429) }
    }
    return next()
  })
  async function family(c, next) {
    if (c.get('user')?.provider !== 'family') return c.json({ error: '家族用アカウントでログインしてください' }, 403)
    return next()
  }
  async function body(c) {
    const text = await c.req.text()
    if (text.length > 32_768) throw new Error('Response too large')
    return JSON.parse(text)
  }
  async function challenge(c, ceremony, value, accountId = null) {
    const previous = await getSignedCookie(c, sessionSecret(c), COOKIE)
    if (previous) await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE id = ?').bind(previous).run()
    await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at <= ?').bind(Date.now()).run()
    const id = crypto.randomUUID()
    await c.env.DB.prepare('INSERT INTO passkey_challenges (id, challenge, ceremony, account_id, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, value, ceremony, accountId, Date.now() + TTL).run()
    await setSignedCookie(c, COOKIE, id, sessionSecret(c), options(c))
  }
  async function consume(c, ceremony, accountId = null) {
    const id = await getSignedCookie(c, sessionSecret(c), COOKIE)
    deleteCookie(c, COOKIE, options(c))
    if (!id) return null
    // DELETE RETURNING consumes atomically, including concurrent verification attempts.
    const row = await c.env.DB.prepare('DELETE FROM passkey_challenges WHERE id = ? RETURNING *').bind(id).first()
    return row && row.ceremony === ceremony && row.account_id === accountId && row.expires_at > Date.now() ? row : null
  }
  routes.get('/', requireUser, family, async c => {
    const { results } = await c.env.DB.prepare('SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt FROM passkeys WHERE account_id = ? ORDER BY created_at DESC')
      .bind(c.get('user').accountId).all()
    return c.json(results)
  })
  routes.delete('/:id', requireUser, family, async c => {
    const result = await c.env.DB.prepare('DELETE FROM passkeys WHERE id = ? AND account_id = ?').bind(c.req.param('id'), c.get('user').accountId).run()
    return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'パスキーが見つかりません' }, 404)
  })
  routes.post('/register/options', requireUser, family, async c => {
    const user = c.get('user')
    const active = await getActiveFamilyAccount(c, user.accountId)
    if (!active) return c.json({ error: 'Unauthorized' }, 401)
    const { account } = active
    const { results } = await c.env.DB.prepare('SELECT id, transports FROM passkeys WHERE account_id = ?').bind(user.accountId).all()
    if (results.length >= 10) return c.json({ error: 'パスキーは10件まで登録できます' }, 400)
    const result = await generateRegistrationOptions({
      rpName: 'épicerie', rpID: rp(c).id, userID: new TextEncoder().encode(user.accountId),
      userName: account.login_id, userDisplayName: user.name, attestationType: 'none',
      excludeCredentials: results.map(row => ({ id: row.id, transports: JSON.parse(row.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      supportedAlgorithmIDs: [-7, -257],
    })
    await challenge(c, 'register', result.challenge, user.accountId)
    return c.json(result)
  })
  routes.post('/register/verify', requireUser, family, async c => {
    const pending = await consume(c, 'register', c.get('user').accountId)
    if (!pending) return invalid(c)
    let data, result
    try {
      data = await body(c)
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 80) return invalid(c)
      result = await verifyRegistrationResponse({ response: data.credential, expectedChallenge: pending.challenge,
        expectedOrigin: rp(c).origin, expectedRPID: rp(c).id, requireUserVerification: true, supportedAlgorithmIDs: [-7, -257] })
    } catch { return invalid(c) }
    if (!result.verified || !result.registrationInfo) return invalid(c)
    const { credential } = result.registrationInfo
    // Conditional insertion enforces the limit even if registration requests race.
    const stored = await c.env.DB.prepare(`INSERT INTO passkeys (id, account_id, public_key, counter, transports, name, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM passkeys WHERE account_id = ?) < 10
      ON CONFLICT(id) DO NOTHING`).bind(credential.id, pending.account_id, encode(credential.publicKey), credential.counter,
      JSON.stringify(credential.transports || []), data.name.trim(), Date.now(), pending.account_id).run()
    return stored.meta.changes ? c.json({ ok: true }, 201) : c.json({ error: '登録済み、または登録上限に達しています' }, 409)
  })
  routes.post('/login/options', async c => {
    const result = await generateAuthenticationOptions({ rpID: rp(c).id, userVerification: 'required' })
    await challenge(c, 'login', result.challenge)
    return c.json(result)
  })
  routes.post('/login/verify', async c => {
    const pending = await consume(c, 'login')
    if (!pending) return invalid(c)
    let data
    try { data = await body(c) } catch { return invalid(c) }
    if (typeof data?.id !== 'string' || data.id.length > 2048) return invalid(c)
    const key = await c.env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(data.id).first()
    const familyAccount = key && await getActiveFamilyAccount(c, key.account_id)
    if (!familyAccount) return invalid(c)
    let result
    try {
      if (data.response?.userHandle !== encode(new TextEncoder().encode(key.account_id))) return invalid(c)
      result = await verifyAuthenticationResponse({ response: data, expectedChallenge: pending.challenge,
        expectedOrigin: rp(c).origin, expectedRPID: rp(c).id, requireUserVerification: true,
        credential: { id: key.id, publicKey: new Uint8Array(Buffer.from(key.public_key, 'base64url')), counter: key.counter, transports: JSON.parse(key.transports) } })
    } catch { return invalid(c) }
    if (!result.verified) return invalid(c)
    const updated = await c.env.DB.prepare('UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ? AND counter = ?')
      .bind(result.authenticationInfo.newCounter, Date.now(), key.id, key.counter).run()
    if (!updated.meta.changes) return invalid(c)
    await issueAccountSession(c, familyAccount.account)
    return c.json(familyAccount.user)
  })
  return routes
}
