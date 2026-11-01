// @vitest-environment node
// Integration tests use Node 22.13+ built-in SQLite to execute the production SQL.
import { DatabaseSync } from 'node:sqlite'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateSignedCookie } from 'hono/cookie'
import { onRequest } from '../api/[[route]].js'

let sqlite, env, ownerCookie, otherCookie
function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      let args = []
      return {
        bind(...values) { args = values; return this },
        async first() { return stmt.get(...args) || null },
        async all() { return { results: stmt.all(...args) } },
        async run() { const result = stmt.run(...args); return { meta: { changes: result.changes } } },
      }
    },
    async batch(statements) { return Promise.all(statements.map(stmt => stmt.run())) },
  }
}
async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const background = []
  const request = new Request('https://shop.example/api' + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const response = await onRequest({ request, env, waitUntil(promise) { background.push(promise) } })
  await Promise.all(background)
  return response
}
async function create(overrides = {}, cookie = ownerCookie) {
  const response = await call('/agent-accounts', { method: 'POST', cookie,
    body: { name: 'Muse', loginId: 'muse-shopping', permission: 'read', listIds: ['list-a'], expiresInDays: 30, ...overrides } })
  return { response, account: await response.json() }
}
async function login(account, password = account.password, headers = {}) {
  const response = await call('/auth/password', { method: 'POST', body: { loginId: account.loginId, password }, headers })
  return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'))
  sqlite.exec(`INSERT INTO lists VALUES ('list-a','A','AAAAAA',101,1),('list-b','B','BBBBBB',101,2),('foreign','Private','FFFFFF',202,3);
    INSERT INTO list_members(list_id,tg_user_id,joined_at) VALUES ('list-a',101,1),('list-b',101,1),('foreign',202,1);
    INSERT INTO items(id,list_id,name,added_by,created_at,updated_at) VALUES ('item-a','list-a','Milk',101,1,1),('item-b','list-b','Secret',101,1,1);
    INSERT INTO item_attachments VALUES ('att-a','item-a','a.png','image/png','key-a',1),('att-b','item-b','b.png','image/png','key-b',1);`)
  env = { DB: d1(sqlite), SESSION_SECRET: 's'.repeat(64), AGENT_PASSWORD_PEPPER: 'p'.repeat(64), APP_ORIGIN: 'https://shop.example', GOOGLE_ALLOWED_EMAILS: 'owner@example.com,other@example.com',
    BUCKET: { async delete() {}, async get() { return { body: 'image', httpEtag: 'etag', writeHttpMetadata(headers) { headers.set('Content-Type', 'image/png') } } } } }
  ownerCookie = (await generateSignedCookie('epicerie_session', JSON.stringify({ provider: 'telegram', userId: 101, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)).split(';')[0]
  otherCookie = (await generateSignedCookie('epicerie_session', JSON.stringify({ provider: 'telegram', userId: 202, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)).split(';')[0]
})
afterEach(() => sqlite.close())

describe('ID/password agent accounts', () => {
  it('requires human authentication, stores a salted hash and only returns the password on creation', async () => {
    expect((await call('/agent-accounts')).status).toBe(401)
    const { response, account } = await create()
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(account.password).toMatch(/^[a-f0-9]{48}$/)
    const stored = sqlite.prepare('SELECT * FROM agent_accounts').get()
    expect(stored.password_hash).not.toBe(account.password)
    expect(stored.password_salt).toHaveLength(32)
    const listed = await (await call('/agent-accounts', { cookie: ownerCookie })).json()
    expect(listed[0]).not.toHaveProperty('password')
    expect(listed[0]).not.toHaveProperty('password_hash')
    expect(listed[0]).not.toHaveProperty('password_salt')
    expect(await (await call('/agent-accounts', { cookie: otherCookie })).json()).toEqual([])
  })
  it('logs into a secure browser session and filters the actual list API', async () => {
    const { account } = await create()
    const { response, cookie } = await login(account)
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(response.headers.get('set-cookie')).toMatch(/Secure/)
    const me = await (await call('/auth/me', { cookie })).json()
    expect(me).toMatchObject({ id: 101, provider: 'agent', permission: 'read', agentId: account.id })
    const lists = await (await call('/lists', { cookie })).json()
    expect(lists.map(list => list.id)).toEqual(['list-a'])
    expect(lists[0]).not.toHaveProperty('share_code')
    expect(await (await call('/lists/list-a', { cookie })).json()).not.toHaveProperty('share_code')
    expect((await call('/lists/list-a/items', { cookie })).status).toBe(200)
    expect(sqlite.prepare('SELECT last_used_at FROM agent_accounts').get().last_used_at).toBeGreaterThan(0)
    expect((await call('/auth/logout', { method: 'POST', cookie })).headers.get('set-cookie')).toContain('Max-Age=0')
  })
  it('blocks writes for read-only accounts and all access outside their lists, including attachments', async () => {
    const { account } = await create()
    const { cookie } = await login(account)
    expect((await call('/lists/list-a/items', { method: 'POST', cookie, body: { name: 'Bread' } })).status).toBe(403)
    expect((await call('/items/item-a', { method: 'PATCH', cookie, body: { checked: true } })).status).toBe(403)
    expect((await call('/lists/list-b', { cookie })).status).toBe(403)
    expect((await call('/items/item-b/attachments', { cookie })).status).toBe(403)
    expect((await call('/attachments/att-b/download', { cookie })).status).toBe(403)
    expect((await call('/items/item-a/attachments', { cookie })).status).toBe(200)
    expect((await call('/attachments/att-a/download', { cookie })).status).toBe(200)
  })
  it('permits item additions and updates, but blocks deletion, account settings and scope escalation', async () => {
    const { account } = await create({ permission: 'items:write' })
    const { cookie } = await login(account)
    const response = await call('/lists/list-a/items', { method: 'POST', cookie, body: { name: 'にんじん', category: '野菜・果物' } })
    expect(response.status).toBe(200)
    const item = await response.json()
    expect((await call('/items/' + item.id, { method: 'PATCH', cookie, body: { checked: true, actor: { id: 202 }, agent: { id: 'forged' } } })).status).toBe(200)
    expect(sqlite.prepare('SELECT checked FROM items WHERE id=?').get(item.id).checked).toBe(1)
    const details = JSON.parse(sqlite.prepare("SELECT details FROM user_logs WHERE action='CREATE_ITEM'").get().details)
    expect(details.agent).toEqual({ id: account.id, name: 'Muse' })
    const updatedDetails = JSON.parse(sqlite.prepare("SELECT details FROM user_logs WHERE action='UPDATE_ITEM'").get().details)
    expect(updatedDetails).not.toHaveProperty('actor')
    expect(updatedDetails.agent).toEqual({ id: account.id, name: 'Muse' })
    for (const [path, method] of [
      ['/items/item-a', 'DELETE'], ['/lists/list-a', 'DELETE'], ['/lists/list-a', 'PATCH'], ['/lists/list-a/archive', 'POST'],
      ['/lists', 'POST'], ['/lists/join', 'POST'], ['/favorites', 'GET'], ['/agent-accounts', 'GET'],
      ['/agent-accounts', 'POST'], ['/agent-accounts/' + account.id, 'DELETE'], ['/auth/session', 'POST'], ['/auth/telegram', 'POST'],
      ['/lists/list-a/upload', 'POST'], ['/lists/list-a/recategorize', 'POST'],
    ]) expect((await call(path, { method, cookie, ...(method === 'POST' ? { body: {} } : {}) })).status, path).toBe(403)
    expect((await call('/items/item-b', { method: 'PATCH', cookie, body: { name: 'intrusion' } })).status).toBe(403)
  })
  it('revokes existing browser sessions immediately and prevents further login', async () => {
    const { account } = await create()
    const { cookie } = await login(account)
    await call('/agent-accounts/' + account.id, { method: 'DELETE', cookie: otherCookie })
    expect((await call('/auth/me', { cookie })).status).toBe(200)
    await call('/agent-accounts/' + account.id, { method: 'DELETE', cookie: ownerCookie })
    expect((await call('/auth/me', { cookie })).status).toBe(401)
    expect((await login(account)).response.status).toBe(401)
  })
  it('enforces expiration and rechecks list membership on every request', async () => {
    const { account } = await create()
    const { cookie } = await login(account)
    sqlite.prepare("DELETE FROM list_members WHERE list_id='list-a' AND tg_user_id=101").run()
    expect(await (await call('/lists', { cookie })).json()).toEqual([])
    expect((await call('/lists/list-a/items', { cookie })).status).toBe(403)
    sqlite.prepare('UPDATE agent_accounts SET expires_at=? WHERE id=?').run(Date.now() - 1, account.id)
    expect((await call('/auth/me', { cookie })).status).toBe(401)
    expect((await login(account)).response.status).toBe(401)
  })
  it('validates ownership, scopes, identifiers and expiration; rejects duplicate login IDs', async () => {
    for (const body of [{ listIds: [] }, { permission: 'admin' }, { expiresInDays: 0 }, { expiresInDays: 91 }, { loginId: '!' }]) {
      expect((await create(body)).response.status).toBe(400)
    }
    expect((await create({ listIds: ['foreign'] })).response.status).toBe(403)
    expect((await create({ loginId: ' MUSE-Shopping ' })).response.status).toBe(201)
    expect((await create()).response.status).toBe(409)
  })
  it('returns a generic credential error and rate-limits repeated login attempts', async () => {
    const { account } = await create()
    const nonexistent = await login({ loginId: 'unknown-account', password: 'wrong' })
    const incorrect = await login(account, 'wrong')
    expect(await nonexistent.response.json()).toEqual(await incorrect.response.json())
    for (let i = 0; i < 9; i++) expect((await login(account, 'wrong')).response.status).toBe(401)
    const throttled = await login(account)
    expect(throttled.response.status).toBe(429)
    expect(throttled.response.headers.get('retry-after')).toBe('900')
  })
  it('rejects cross-site login and missing configuration', async () => {
    const { account } = await create()
    expect((await login(account, account.password, { Origin: 'https://evil.example' })).response.status).toBe(403)
    delete env.AGENT_PASSWORD_PEPPER
    expect((await login(account)).response.status).toBe(503)
    expect((await create({ loginId: 'another-agent' })).response.status).toBe(503)
  })
})


const sharedMigration = readFileSync(new URL('../../migrate_shared_workspace.sql', import.meta.url), 'utf8')
function prepareSharedData() {
  sqlite.exec(`INSERT INTO lists VALUES ('test-only','Test','TTTTTT',303,1);
    INSERT INTO list_members(list_id,tg_user_id,joined_at) VALUES ('test-only',303,1);
    INSERT INTO favorites VALUES ('fav-a',101,'Milk','Other',1),('fav-b',202,'Bread','Other',2),('fav-test',303,'Test favorite','Other',3);
    INSERT INTO shared_telegram_users VALUES (101),(202);`)
  sqlite.exec(sharedMigration)
  env.SHARED_DATA_MODE = 'true'
}
function telegramHeaders(id) {
  env.TELEGRAM_BOT_TOKEN = '123456:' + 'b'.repeat(40)
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Telegram member' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return { 'X-Telegram-Init-Data': params.toString() }
}
describe('Shared household data with separate identities', () => {
  it('copies only enrolled users data, preserves originals, and does not resurrect deleted shared data on rerun', () => {
    sqlite.exec(sharedMigration)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM data_migrations').get().n).toBe(0)
    prepareSharedData()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM list_members WHERE tg_user_id=0').get().n).toBe(3)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM favorites WHERE tg_user_id=0').get().n).toBe(2)
    expect(sqlite.prepare("SELECT created_by FROM lists WHERE id='list-a'").get().created_by).toBe(101)
    expect(sqlite.prepare("SELECT created_by FROM lists WHERE id='test-only'").get().created_by).toBe(303)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM favorites WHERE tg_user_id>0').get().n).toBe(3)
    sqlite.exec("DELETE FROM favorites WHERE id='shared:fav-a'; UPDATE list_members SET archived_at=123 WHERE list_id='list-a' AND tg_user_id=0;")
    sqlite.exec(sharedMigration)
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM favorites WHERE id='shared:fav-a'").get().n).toBe(0)
    expect(sqlite.prepare("SELECT archived_at FROM list_members WHERE list_id='list-a' AND tg_user_id=0").get().archived_at).toBe(123)
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM data_migrations').get().n).toBe(1)
  })
  it('shows the same lists and favorites to two enrolled Telegram accounts while retaining their actual identity', async () => {
    prepareSharedData()
    const first = await (await call('/auth/me', { cookie: ownerCookie })).json()
    const second = await (await call('/auth/me', { cookie: otherCookie })).json()
    expect(first).toMatchObject({ id: 0, accountId: 101, shared: true, provider: 'telegram' })
    expect(second).toMatchObject({ id: 0, accountId: 202, shared: true, provider: 'telegram' })
    const lists = await (await call('/lists', { cookie: ownerCookie })).json()
    expect(new Set(lists.map(list => list.id))).toEqual(new Set(['list-a','list-b','foreign']))
    expect(await (await call('/lists', { cookie: otherCookie })).json()).toEqual(lists)
    const favorites = await (await call('/favorites', { cookie: otherCookie })).json()
    expect(new Set(favorites.map(favorite => favorite.name))).toEqual(new Set(['Milk','Bread']))
    expect((await call('/lists/test-only', { cookie: ownerCookie })).status).toBe(404)
    const created = await (await call('/lists', { method: 'POST', cookie: ownerCookie, body: { name: 'Shared new list' } })).json()
    expect((await (await call('/lists', { cookie: otherCookie })).json()).some(list => list.id === created.id)).toBe(true)
    const details = JSON.parse(sqlite.prepare("SELECT details FROM user_logs WHERE action='CREATE_LIST'").get().details)
    expect(details.actor).toMatchObject({ provider: 'telegram', id: 101 })
  })
  it('lets shared members manage legacy lists without changing original owners or exposing excluded lists', async () => {
    prepareSharedData()
    expect((await call('/lists/list-a/members/me', { method: 'DELETE', cookie: ownerCookie })).status).toBe(403)
    expect((await call('/lists/test-only', { method: 'DELETE', cookie: otherCookie })).status).toBe(403)
    expect((await call('/lists/list-a', { method: 'DELETE', cookie: otherCookie })).status).toBe(200)
  })
  it('shares data with enrolled Telegram accounts and preserves the original ID inside legacy sessions', async () => {
    prepareSharedData()
    const response = await call('/auth/telegram', { method: 'POST', headers: telegramHeaders(101) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: 0, accountId: 101, provider: 'telegram', shared: true })
    const cookie = response.headers.get('set-cookie').split(';')[0]
    expect((await (await call('/lists', { cookie })).json()).length).toBe(3)
    const token = await (await call('/auth/session', { method: 'POST', cookie })).json()
    expect((await call('/lists', { headers: { 'X-Session-Token': token.token } })).status).toBe(200)
    expect((await call('/auth/telegram', { method: 'POST', headers: telegramHeaders(303) })).status).toBe(401)
  })
  it('preserves existing agent credentials and list restrictions when data becomes shared', async () => {
    const { account } = await create({ permission: 'items:write' })
    prepareSharedData()
    const { cookie } = await login(account)
    expect((await call('/lists/list-a/items', { cookie })).status).toBe(200)
    expect((await call('/lists/list-b/items', { cookie })).status).toBe(403)
    expect((await (await call('/agent-accounts', { cookie: otherCookie })).json())[0].id).toBe(account.id)
    await call('/agent-accounts/' + account.id, { method: 'DELETE', cookie: otherCookie })
    expect((await call('/auth/me', { cookie })).status).toBe(401)
  })
})
