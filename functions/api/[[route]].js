import { Hono } from 'hono'
import { categorize, categorizeBatch } from '../lib/categorize.js'

const app = new Hono().basePath('/api')

// Auth middleware
app.use('*', async (c, next) => {
  if (c.env.ALLOW_UNAUTH === 'true') {
    c.set('userId', 999999)
    return next()
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return c.json({ error: 'Server misconfigured' }, 500)

  // 1. Try session token
  const sessionToken = c.req.header('X-Session-Token')
  if (sessionToken) {
    const result = await verifySession(sessionToken, botToken)
    if (result.valid) {
      c.set('userId', result.userId)
      return next()
    }
    // Invalid/expired token — fall through to initData
  }

  // 2. Try Telegram initData
  const initData = c.req.header('X-Telegram-Init-Data')
  if (!initData) return c.json({ error: 'Unauthorized' }, 401)

  const result = await validateInitData(initData, botToken)
  if (!result.valid) return c.json({ error: 'Invalid auth' }, 401)

  c.set('userId', result.userId)
  return next()
})

// GET /api/lists
app.get('/lists', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(`
    SELECT l.id, l.name, l.share_code, l.created_by,
           COUNT(i.id) AS item_count,
           SUM(CASE WHEN i.checked = 1 THEN 1 ELSE 0 END) AS checked_count
    FROM lists l
    JOIN list_members lm ON l.id = lm.list_id
    LEFT JOIN items i ON l.id = i.list_id
    WHERE lm.tg_user_id = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).bind(userId).all()
  return c.json(results)
})

// POST /api/lists
app.post('/lists', async (c) => {
  const userId = c.get('userId')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)

  const id = crypto.randomUUID()
  const shareCode = generateShareCode()
  const now = Date.now()

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO lists (id, name, share_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name.trim(), shareCode, userId, now),
    c.env.DB.prepare('INSERT INTO list_members (list_id, tg_user_id, joined_at) VALUES (?, ?, ?)')
      .bind(id, userId, now),
  ])

  return c.json({ id, name: name.trim(), share_code: shareCode, created_by: userId })
})

// POST /api/lists/join
app.post('/lists/join', async (c) => {
  const userId = c.get('userId')
  const { shareCode } = await c.req.json()
  if (!shareCode) return c.json({ error: 'Share code required' }, 400)

  const list = await c.env.DB.prepare('SELECT id, name FROM lists WHERE share_code = ?')
    .bind(shareCode.toUpperCase()).first()
  if (!list) return c.json({ error: 'List not found' }, 404)

  const exists = await c.env.DB.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND tg_user_id = ?')
    .bind(list.id, userId).first()
  if (!exists) {
    await c.env.DB.prepare('INSERT INTO list_members (list_id, tg_user_id, joined_at) VALUES (?, ?, ?)')
      .bind(list.id, userId, Date.now()).run()
  }

  return c.json({ id: list.id, name: list.name })
})

// GET /api/lists/:id
app.get('/lists/:id', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  if (!await hasAccess(c.env.DB, listId, userId)) return c.json({ error: 'Not found' }, 404)

  const list = await c.env.DB.prepare('SELECT id, name, share_code, created_by FROM lists WHERE id = ?')
    .bind(listId).first()
  return c.json(list)
})

// DELETE /api/lists/:id
app.delete('/lists/:id', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  const list = await c.env.DB.prepare('SELECT created_by FROM lists WHERE id = ?').bind(listId).first()
  if (!list || list.created_by !== userId) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(listId).run()
  return c.json({ ok: true })
})

// GET /api/lists/:id/items
app.get('/lists/:id/items', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  if (!await hasAccess(c.env.DB, listId, userId)) return c.json({ error: 'Not found' }, 404)

  const { results } = await c.env.DB.prepare(
    'SELECT id, list_id, name, checked, added_by, created_at, category, quantity, unit, note FROM items WHERE list_id = ? ORDER BY created_at ASC'
  ).bind(listId).all()
  return c.json(results.map(r => ({ ...r, checked: !!r.checked })))
})

// POST /api/lists/:id/items
app.post('/lists/:id/items', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  if (!await hasAccess(c.env.DB, listId, userId)) return c.json({ error: 'Not found' }, 404)

  const { name, category, quantity, unit, note } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)

  const id = crypto.randomUUID()
  const now = Date.now()
  // category が「その他」または未指定の場合、自動分類を行う
  const cat = (category != null && category !== 'その他') ? category : await categorize(name.trim(), c.env)
  const qty = quantity ?? null
  const u = unit || ''
  const n = note || ''

  await c.env.DB.prepare(
    'INSERT INTO items (id, list_id, name, checked, added_by, created_at, updated_at, category, quantity, unit, note) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, listId, name.trim(), userId, now, now, cat, qty, u, n).run()

  return c.json({ id, list_id: listId, name: name.trim(), checked: false, added_by: userId, category: cat, quantity: qty, unit: u, note: n, created_at: now })
})

// PATCH /api/items/:id
app.patch('/items/:id', async (c) => {
  const userId = c.get('userId')
  const itemId = c.req.param('id')
  const item = await c.env.DB.prepare('SELECT list_id, name FROM items WHERE id = ?').bind(itemId).first()
  if (!item) return c.json({ error: 'Not found' }, 404)
  if (!await hasAccess(c.env.DB, item.list_id, userId)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const sets = []
  const vals = []
  let updatedCategory = undefined

  if ('checked' in body) { sets.push('checked = ?'); vals.push(body.checked ? 1 : 0) }
  if ('name' in body && body.name?.trim()) { sets.push('name = ?'); vals.push(body.name.trim()) }
  if ('category' in body) {
    let newCat = body.category || 'その他'
    if (newCat === 'その他') {
      const targetName = body.name?.trim() || item.name
      newCat = await categorize(targetName, c.env)
    }
    updatedCategory = newCat
    sets.push('category = ?'); vals.push(newCat)
  }
  if ('quantity' in body) { sets.push('quantity = ?'); vals.push(body.quantity ?? null) }
  if ('unit' in body) { sets.push('unit = ?'); vals.push(body.unit || '') }
  if ('note' in body) { sets.push('note = ?'); vals.push(body.note || '') }
  if (sets.length === 0) return c.json({ error: 'No updates' }, 400)

  sets.push('updated_at = ?')
  vals.push(Date.now(), itemId)
  await c.env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  
  const responseObj = { ok: true }
  if (updatedCategory !== undefined) responseObj.category = updatedCategory
  return c.json(responseObj)
})

// DELETE /api/items/:id
app.delete('/items/:id', async (c) => {
  const userId = c.get('userId')
  const itemId = c.req.param('id')
  const item = await c.env.DB.prepare('SELECT list_id FROM items WHERE id = ?').bind(itemId).first()
  if (!item) return c.json({ error: 'Not found' }, 404)
  if (!await hasAccess(c.env.DB, item.list_id, userId)) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(itemId).run()
  return c.json({ ok: true })
})

// POST /api/lists/:id/recategorize — 'その他' アイテムを一括再分類
app.post('/lists/:id/recategorize', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  if (!await hasAccess(c.env.DB, listId, userId)) return c.json({ error: 'Not found' }, 404)

  const { results } = await c.env.DB.prepare(
    "SELECT id, name FROM items WHERE list_id = ? AND category = 'その他'"
  ).bind(listId).all()

  if (results.length === 0) return c.json({ updated: 0 })

  const names = results.map(r => r.name)
  const categories = await categorizeBatch(names, c.env)

  const now = Date.now()
  const updates = results
    .map((r, i) => ({ id: r.id, category: categories[i] }))
    .filter(u => u.category !== 'その他')

  if (updates.length > 0) {
    await c.env.DB.batch(
      updates.map(u =>
        c.env.DB.prepare('UPDATE items SET category = ?, updated_at = ? WHERE id = ?')
          .bind(u.category, now, u.id)
      )
    )
  }

  return c.json({ updated: updates.length })
})

// GET /api/favorites
app.get('/favorites', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, category, created_at FROM favorites WHERE tg_user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json(results)
})

// POST /api/favorites
app.post('/favorites', async (c) => {
  const userId = c.get('userId')
  const { name, category } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)

  const cat = (category != null && category !== 'その他') ? category : await categorize(name.trim(), c.env)

  const existing = await c.env.DB.prepare(
    'SELECT id, category FROM favorites WHERE tg_user_id = ? AND name = ?'
  ).bind(userId, name.trim()).first()
  
  if (existing) {
    if (existing.category === 'その他' && cat !== 'その他') {
      await c.env.DB.prepare('UPDATE favorites SET category = ? WHERE id = ?').bind(cat, existing.id).run()
    }
    return c.json({ id: existing.id, name: name.trim(), category: cat })
  }

  const id = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO favorites (id, tg_user_id, name, category, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, name.trim(), cat, now).run()
  return c.json({ id, name: name.trim(), category: cat, created_at: now })
})

// DELETE /api/favorites/:id
app.delete('/favorites/:id', async (c) => {
  const userId = c.get('userId')
  const favId = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM favorites WHERE id = ? AND tg_user_id = ?').bind(favId, userId).run()
  return c.json({ ok: true })
})

// POST /api/auth/session — issue a signed session token for the authenticated user
app.post('/auth/session', async (c) => {
  const userId = c.get('userId')
  const secret = c.env.TELEGRAM_BOT_TOKEN || 'dev-session-secret'
  const { token, expiresAt } = await signSession(userId, secret)
  return c.json({ token, expiresAt })
})

// Helpers

async function hasAccess(db, listId, userId) {
  const row = await db.prepare('SELECT 1 FROM list_members WHERE list_id = ? AND tg_user_id = ?')
    .bind(listId, userId).first()
  return !!row
}

function generateShareCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Session token helpers

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function toBase64url(bytes) {
  let binary = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function signSession(userId, secret) {
  const exp = Date.now() + SESSION_DURATION_MS
  const payloadB64 = toBase64url(new TextEncoder().encode(JSON.stringify({ uid: userId, exp })))
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return { token: `${payloadB64}.${toBase64url(sig)}`, expiresAt: exp }
}

async function verifySession(token, secret) {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return { valid: false }
    const payloadB64 = token.slice(0, dot)
    const sigB64 = token.slice(dot + 1)

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
    if (toBase64url(expected) !== sigB64) return { valid: false }

    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(payloadB64)))
    if (payload.exp <= Date.now()) return { valid: false }

    return { valid: true, userId: payload.uid }
  } catch {
    return { valid: false }
  }
}

async function validateInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return { valid: false }
    params.delete('hash')

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const secretKey = await crypto.subtle.sign('HMAC', keyMaterial, enc.encode(botToken))
    const hmacKey = await crypto.subtle.importKey(
      'raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dataCheckString))
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

    if (computed !== hash) return { valid: false }

    const user = JSON.parse(params.get('user') || '{}')
    return { valid: true, userId: user.id }
  } catch {
    return { valid: false }
  }
}

export const onRequest = (ctx) => app.fetch(ctx.request, ctx.env, ctx)
