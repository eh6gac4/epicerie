import { Hono } from 'hono'

export const agentAccounts = new Hono()
const DAY = 86_400_000
const PERMISSIONS = ['read', 'items:write']
const LOGIN_ID = /^[a-z0-9][a-z0-9._-]{2,63}$/
const encoder = new TextEncoder()
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
const unhex = value => Uint8Array.from(value.match(/../g) || [], byte => parseInt(byte, 16))
function passwordConfigured(c) { return c.env.AGENT_PASSWORD_PEPPER?.length >= 32 }
function metadata(row) {
  return { id: row.id, name: row.name, loginId: row.login_id, permission: row.permission,
    listIds: JSON.parse(row.list_ids), createdAt: row.created_at, expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at, revokedAt: row.revoked_at }
}
function agentUser(row) {
  return { id: row.user_id, name: row.name, provider: 'agent', agentId: row.id, permission: row.permission }
}
async function passwordHash(password, salt, pepper) {
  // Workers limits PBKDF2 to 100,000 iterations. Passwords are random 192-bit values;
  // a separate server-side pepper also protects against database-only disclosure.
  const pepperKey = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const input = await crypto.subtle.sign('HMAC', pepperKey, encoder.encode(password))
  const key = await crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100_000 }, key, 256))
}
async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

agentAccounts.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  if (c.get('agent')) return c.json({ error: 'Human login required' }, 403)
  return next()
})
agentAccounts.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, name, login_id, permission, list_ids,
    created_at, expires_at, last_used_at, revoked_at FROM agent_accounts WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(c.get('userId')).all()
  return c.json(results.map(metadata))
})
agentAccounts.post('/', async (c) => {
  if (!passwordConfigured(c)) return c.json({ error: 'AGENT_PASSWORD_PEPPER must be configured' }, 503)
  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON' }, 400) }
  const { name, loginId, permission, listIds, expiresInDays = 30 } = body || {}
  const normalizedId = typeof loginId === 'string' ? loginId.trim().toLowerCase() : ''
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !LOGIN_ID.test(normalizedId) ||
      !PERMISSIONS.includes(permission) || !Array.isArray(listIds) || !listIds.length || listIds.length > 20 ||
      listIds.some(id => typeof id !== 'string' || !id || id.length > 128) ||
      !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) {
    return c.json({ error: '名前、ログインID（英数字等3〜64文字）、対象リスト、権限、有効期限（1〜90日）を確認してください' }, 400)
  }
  const ids = [...new Set(listIds)]
  const userId = c.get('userId')
  for (const listId of ids) {
    if (!await c.env.DB.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND tg_user_id = ?').bind(listId, userId).first()) {
      return c.json({ error: '対象リストにアクセスできません' }, 403)
    }
  }
  if (await c.env.DB.prepare('SELECT id FROM agent_accounts WHERE login_id = ?').bind(normalizedId).first()) {
    return c.json({ error: 'このログインIDは使用されています' }, 409)
  }
  const password = hex(crypto.getRandomValues(new Uint8Array(24)))
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  const now = Date.now()
  const row = { id: crypto.randomUUID(), name: name.trim(), login_id: normalizedId,
    permission, list_ids: JSON.stringify(ids), created_at: now, expires_at: now + expiresInDays * DAY,
    last_used_at: null, revoked_at: null }
  const hash = hex(await passwordHash(password, salt, c.env.AGENT_PASSWORD_PEPPER))
  // The unique login_id index also handles concurrent creation attempts.
  const result = await c.env.DB.prepare(`INSERT INTO agent_accounts
    (id, user_id, name, login_id, password_hash, password_salt, permission, list_ids, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(login_id) DO NOTHING RETURNING id`)
    .bind(row.id, userId, row.name, normalizedId, hash, salt, permission, row.list_ids, now, row.expires_at).first()
  if (!result) return c.json({ error: 'このログインIDは使用されています' }, 409)
  return c.json({ ...metadata(row), password }, 201)
})
agentAccounts.delete('/:id', async (c) => {
  await c.env.DB.prepare('UPDATE agent_accounts SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND user_id = ?')
    .bind(Date.now(), c.req.param('id'), c.get('userId')).run()
  return c.json({ ok: true })
})

export async function verifyAgentLogin(c) {
  if (!passwordConfigured(c)) return { error: 'ID・パスワード認証は未設定です', status: 503 }
  let body
  try { body = await c.req.json() } catch { return { error: 'Invalid JSON', status: 400 } }
  const loginId = typeof body?.loginId === 'string' ? body.loginId.trim().toLowerCase() : ''
  const password = body?.password
  const invalid = { error: 'IDまたはパスワードが正しくありません', status: 401 }
  if (!LOGIN_ID.test(loginId) || typeof password !== 'string' || password.length > 128) return invalid
  const now = Date.now()
  const ip = c.req.header('CF-Connecting-IP') || 'local'
  await c.env.DB.prepare('DELETE FROM agent_login_attempts WHERE window_start < ?').bind(now - DAY).run()
  for (const [key, limit] of [[`ip:${ip}`, 50], [`login:${ip}:${loginId}`, 10]]) {
    const attempt = await c.env.DB.prepare(`INSERT INTO agent_login_attempts (bucket, attempts, window_start) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET
      attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING attempts`)
      .bind(await sha256(key), now, now - 900_000, now - 900_000).first()
    if (attempt.attempts > limit) {
      c.header('Retry-After', '900')
      return { error: '試行回数が多すぎます。15分後にお試しください', status: 429 }
    }
  }
  const row = await c.env.DB.prepare('SELECT * FROM agent_accounts WHERE login_id = ?').bind(loginId).first()
  const hash = await passwordHash(password, row?.password_salt || '0'.repeat(32), c.env.AGENT_PASSWORD_PEPPER)
  const expected = unhex(row?.password_hash || '0'.repeat(64))
  let different = hash.length ^ expected.length
  for (let i = 0; i < hash.length; i++) different |= hash[i] ^ (expected[i] || 0)
  if (different || !row || row.revoked_at !== null || row.expires_at <= now) return invalid
  return { account: row, user: agentUser(row) }
}
// Explicit allowlist: new API endpoints do not automatically become agent-accessible.
async function allowedList(c, agent) {
  const path = c.req.path
  const method = c.req.method
  if ((method === 'GET' && ['/api/lists', '/api/auth/me'].includes(path)) ||
      (method === 'POST' && path === '/api/auth/logout')) return true
  let listId
  const list = path.match(/^\/api\/lists\/([^/]+)(\/items)?$/)
  const item = path.match(/^\/api\/items\/([^/]+)(\/attachments)?$/)
  const attachment = path.match(/^\/api\/attachments\/([^/]+)\/download$/)
  if (list && (method === 'GET' || (method === 'POST' && list[2] && agent.permission === 'items:write'))) {
    listId = decodeURIComponent(list[1])
  } else if (item && ((method === 'GET' && item[2]) || (method === 'PATCH' && !item[2] && agent.permission === 'items:write'))) {
    const row = await c.env.DB.prepare('SELECT list_id FROM items WHERE id = ?').bind(decodeURIComponent(item[1])).first()
    listId = row?.list_id
  } else if (attachment && method === 'GET') {
    const row = await c.env.DB.prepare('SELECT i.list_id FROM item_attachments a JOIN items i ON i.id = a.item_id WHERE a.id = ?')
      .bind(decodeURIComponent(attachment[1])).first()
    listId = row?.list_id
  }
  if (!listId || !agent.listIds.includes(listId)) return false
  return !!await c.env.DB.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND tg_user_id = ?')
    .bind(listId, agent.user_id).first()
}

export async function authenticateAgentSession(c, session, next) {
  const row = await c.env.DB.prepare('SELECT * FROM agent_accounts WHERE id = ? AND revoked_at IS NULL AND expires_at > ?')
    .bind(session.agentId, Date.now()).first()
  if (!row || !Number.isSafeInteger(row.user_id) || !PERMISSIONS.includes(row.permission)) return c.json({ error: 'Unauthorized' }, 401)
  let agent
  try {
    const listIds = JSON.parse(row.list_ids)
    if (!Array.isArray(listIds) || !listIds.length || listIds.some(id => typeof id !== 'string')) throw new Error('Invalid scope')
    agent = { ...row, listIds }
    if (!await allowedList(c, agent)) return c.json({ error: 'Agent permission denied' }, 403)
  } catch { return c.json({ error: 'Agent permission denied' }, 403) }
  c.set('agent', { id: agent.id, name: agent.name, listIds: agent.listIds, permission: agent.permission })
  c.set('userId', agent.user_id)
  c.set('user', agentUser(agent))
  await c.env.DB.prepare('UPDATE agent_accounts SET last_used_at = ? WHERE id = ?').bind(Date.now(), agent.id).run()
  return next()
}
