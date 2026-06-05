import { Hono } from 'hono'

const app = new Hono().basePath('/api')

// Auth middleware
app.use('*', async (c, next) => {
  if (c.env.ALLOW_UNAUTH === 'true') {
    c.set('userId', 999999)
    return next()
  }

  const botToken = c.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return c.json({ error: 'Server misconfigured' }, 500)

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
    'SELECT id, list_id, name, checked, added_by, created_at FROM items WHERE list_id = ? ORDER BY created_at ASC'
  ).bind(listId).all()
  return c.json(results.map(r => ({ ...r, checked: !!r.checked })))
})

// POST /api/lists/:id/items
app.post('/lists/:id/items', async (c) => {
  const userId = c.get('userId')
  const listId = c.req.param('id')
  if (!await hasAccess(c.env.DB, listId, userId)) return c.json({ error: 'Not found' }, 404)

  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Name required' }, 400)

  const id = crypto.randomUUID()
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO items (id, list_id, name, checked, added_by, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)'
  ).bind(id, listId, name.trim(), userId, now, now).run()

  return c.json({ id, list_id: listId, name: name.trim(), checked: false, added_by: userId })
})

// PATCH /api/items/:id
app.patch('/items/:id', async (c) => {
  const userId = c.get('userId')
  const itemId = c.req.param('id')
  const item = await c.env.DB.prepare('SELECT list_id FROM items WHERE id = ?').bind(itemId).first()
  if (!item) return c.json({ error: 'Not found' }, 404)
  if (!await hasAccess(c.env.DB, item.list_id, userId)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const sets = []
  const vals = []

  if ('checked' in body) { sets.push('checked = ?'); vals.push(body.checked ? 1 : 0) }
  if ('name' in body && body.name?.trim()) { sets.push('name = ?'); vals.push(body.name.trim()) }
  if (sets.length === 0) return c.json({ error: 'No updates' }, 400)

  sets.push('updated_at = ?')
  vals.push(Date.now(), itemId)
  await c.env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run()
  return c.json({ ok: true })
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
