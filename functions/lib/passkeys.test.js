// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import { generateSignedCookie } from 'hono/cookie'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { onRequest } from '../api/[[route]].js'

let db, env, familyCookie, otherCookie, privateKey, publicKey, credentialId
const encode = value => Buffer.from(value).toString('base64url')
const hash = value => createHash('sha256').update(value).digest()
function d1(sqlite) {
  return { prepare(sql) {
    const statement = sqlite.prepare(sql)
    let args = []
    return { bind(...values) { args = values; return this },
      async first() { return statement.get(...args) || null },
      async all() { return { results: statement.all(...args) } },
      async run() { return { meta: { changes: statement.run(...args).changes } } } }
  }, async batch(statements) { return Promise.all(statements.map(s => s.run())) } }
}
async function call(path, { method = 'POST', body, cookie, headers = {} } = {}) {
  return onRequest({ request: new Request('https://shop.example/api/auth/passkeys' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env, waitUntil() {} })
}
function challengeCookie(response) { return response.headers.get('set-cookie')?.split(';')[0] }
async function session(agentId) {
  return (await generateSignedCookie('epicerie_session', JSON.stringify({ provider: 'agent', agentId, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)).split(';')[0]
}
function registration(challenge, overrides = {}) {
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]))
  const clientDataJSON = encode(JSON.stringify({ type: 'webauthn.create', challenge, origin: 'https://shop.example', ...overrides }))
  const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length)
  const authData = Buffer.concat([hash('shop.example'), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), length, credentialId, Buffer.from(cose)])
  return { id: encode(credentialId), rawId: encode(credentialId), type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON, transports: ['internal'], attestationObject: encode(isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]))) } }
}
function assertion(challenge, { origin = 'https://shop.example', rpID = 'shop.example', flags = 5, counter = 1, userHandle = encode('family-a') } = {}) {
  const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }))
  const count = Buffer.alloc(4); count.writeUInt32BE(counter)
  const authData = Buffer.concat([hash(rpID), Buffer.from([flags]), count])
  return { id: encode(credentialId), rawId: encode(credentialId), type: 'public-key', clientExtensionResults: {},
    response: { clientDataJSON: encode(client), authenticatorData: encode(authData), userHandle,
      signature: encode(sign('sha256', Buffer.concat([authData, hash(client)]), privateKey)) } }
}
async function register(cookie = familyCookie) {
  const options = await call('/register/options', { cookie })
  expect(options.status).toBe(200)
  const pending = challengeCookie(options)
  const body = { credential: registration((await options.json()).challenge), name: 'My phone' }
  const response = await call('/register/verify', { cookie: cookie + '; ' + pending, body })
  return { response, pending, body }
}
async function loginOptions() {
  const response = await call('/login/options')
  return { cookie: challengeCookie(response), options: await response.json() }
}
beforeEach(async () => {
  db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys = ON')
  db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'))
  for (const id of ['family-a', 'family-b', 'agent']) {
    db.prepare("INSERT INTO agent_accounts (id,user_id,name,login_id,password_hash,password_salt,permission,list_ids,created_at,expires_at) VALUES (?,0,?,?, 'hash','salt','read','[]',1,?)")
      .run(id, id, id, Date.now() + 60_000)
  }
  db.exec("INSERT INTO family_accounts VALUES ('family-a'),('family-b')")
  env = { DB: d1(db), APP_ORIGIN: 'https://shop.example', SESSION_SECRET: 's'.repeat(64), SHARED_DATA_MODE: 'true' }
  familyCookie = await session('family-a'); otherCookie = await session('family-b')
  ;({ privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }))
  credentialId = Buffer.from(crypto.randomUUID())
})
afterEach(() => db.close())

describe('Family passkeys with real WebAuthn signatures', () => {
  it('registers a discoverable credential, logs in without an ID, and reuses the family session', async () => {
    const { response } = await register()
    expect(response.status).toBe(201)
    const stored = db.prepare('SELECT * FROM passkeys').get()
    expect(stored.account_id).toBe('family-a')
    const listed = await call('', { method: 'GET', cookie: familyCookie })
    expect(await listed.json()).toEqual([{ id: encode(credentialId), name: 'My phone', createdAt: stored.created_at, lastUsedAt: null }])
    const { options, cookie } = await loginOptions()
    expect(options.userVerification).toBe('required')
    expect(options.allowCredentials || []).toEqual([])
    const login = await call('/login/verify', { cookie, body: assertion(options.challenge) })
    expect(login.status).toBe(200)
    expect(await login.json()).toMatchObject({ provider: 'family', accountId: 'family-a', id: 0 })
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')
    expect(login.headers.get('set-cookie')).toContain('Secure')
    const cookies = login.headers.getSetCookie()
    const sessionCookie = cookies.find(s => s.startsWith('epicerie_session=')).split(';')[0]
    const me = await onRequest({ request: new Request('https://shop.example/api/auth/me', { headers: { Cookie: sessionCookie } }), env, waitUntil() {} })
    expect(me.status).toBe(200)
    expect(db.prepare('SELECT counter FROM passkeys').get().counter).toBe(1)
  })
  it('binds registration to the account and browser, consumes challenges once, and expires them', async () => {
    const options = await call('/register/options', { cookie: familyCookie })
    const data = await options.json()
    expect(data.authenticatorSelection).toMatchObject({ residentKey: 'required', userVerification: 'required' })
    const pending = challengeCookie(options)
    const body = { credential: registration(data.challenge), name: 'Phone' }
    expect((await call('/register/verify', { cookie: familyCookie, body })).status).toBe(400)
    expect((await call('/register/verify', { cookie: otherCookie + '; ' + pending, body })).status).toBe(400)
    expect((await call('/register/verify', { cookie: familyCookie + '; ' + pending, body })).status).toBe(400)
    const { pending: used, body: original } = await register()
    expect((await call('/register/verify', { cookie: familyCookie + '; ' + used, body: original })).status).toBe(400)
    const login = await loginOptions()
    db.exec('UPDATE passkey_challenges SET expires_at = 0')
    expect((await call('/login/verify', { cookie: login.cookie, body: assertion(login.options.challenge) })).status).toBe(400)
  })
  it('rejects wrong challenge, origin, RP, absent user verification, signature and account handle', async () => {
    await register()
    for (const overrides of [{ origin: 'https://evil.example' }, { rpID: 'evil.example' }, { flags: 1 }, { userHandle: encode('family-b') }]) {
      const { options, cookie } = await loginOptions()
      const response = await call('/login/verify', { cookie, body: assertion(options.challenge, overrides) })
      expect(response.status).toBe(400)
      expect(response.headers.getSetCookie().some(s => s.startsWith('epicerie_session='))).toBe(false)
    }
    for (const failure of ['signature', 'unknown-key', 'challenge']) {
      const { options, cookie } = await loginOptions()
      const body = assertion(failure === 'challenge' ? 'wrong-challenge' : options.challenge)
      if (failure === 'signature') body.response.signature = encode(Buffer.alloc(72))
      if (failure === 'unknown-key') body.id = encode('unknown')
      expect((await call('/login/verify', { cookie, body })).status).toBe(400)
      expect((await call('/login/verify', { cookie, body: assertion(options.challenge) })).status).toBe(400)
    }
  })
  it('rejects registration from a different origin and replayed authentication counters', async () => {
    const options = await call('/register/options', { cookie: familyCookie })
    const data = await options.json()
    expect((await call('/register/verify', { cookie: familyCookie + '; ' + challengeCookie(options), body: { credential: registration(data.challenge, { origin: 'https://evil.example' }), name: 'Phone' } })).status).toBe(400)
    await register()
    for (const expected of [200, 400]) {
      const { options, cookie } = await loginOptions()
      expect((await call('/login/verify', { cookie, body: assertion(options.challenge) })).status).toBe(expected)
    }
  })
  it('blocks visitors, Telegram and agents from registering or managing family passkeys', async () => {
    for (const cookie of [undefined, await session('agent'), (await generateSignedCookie('epicerie_session', JSON.stringify({ provider: 'telegram', userId: 1, expiresAt: Date.now() + 60_000 }), env.SESSION_SECRET)).split(';')[0]]) {
      for (const [path, method] of [['', 'GET'], ['/register/options', 'POST'], ['/register/verify', 'POST'], ['/key', 'DELETE']]) {
        expect([401, 403]).toContain((await call(path, { method, cookie })).status)
      }
    }
  })
  it('isolates deletion, supports account cascade, and refuses revoked accounts or disabled shared mode', async () => {
    await register()
    const path = '/' + encode(credentialId)
    expect((await call(path, { method: 'DELETE', cookie: otherCookie })).status).toBe(404)
    db.exec("UPDATE agent_accounts SET revoked_at = 1 WHERE id = 'family-a'")
    let pending = await loginOptions()
    expect((await call('/login/verify', { cookie: pending.cookie, body: assertion(pending.options.challenge) })).status).toBe(400)
    db.exec("UPDATE agent_accounts SET revoked_at = NULL WHERE id = 'family-a'")
    env.SHARED_DATA_MODE = 'false'
    pending = await loginOptions()
    expect((await call('/login/verify', { cookie: pending.cookie, body: assertion(pending.options.challenge) })).status).toBe(400)
    env.SHARED_DATA_MODE = 'true'
    expect((await call(path, { method: 'DELETE', cookie: familyCookie })).status).toBe(200)
    pending = await loginOptions()
    expect((await call('/login/verify', { cookie: pending.cookie, body: assertion(pending.options.challenge) })).status).toBe(400)
    await register()
    db.exec("DELETE FROM agent_accounts WHERE id = 'family-a'")
    expect(db.prepare('SELECT COUNT(*) AS count FROM passkeys').get().count).toBe(0)
  })
  it('rejects tampered cookies and allows only one concurrent consumption', async () => {
    await register()
    let pending = await loginOptions()
    expect((await call('/login/verify', { cookie: pending.cookie + 'tampered', body: assertion(pending.options.challenge) })).status).toBe(400)
    pending = await loginOptions()
    const responses = await Promise.all([1, 2].map(() => call('/login/verify', { cookie: pending.cookie, body: assertion(pending.options.challenge) })))
    expect(responses.map(r => r.status).sort()).toEqual([200, 400])
  })
  it('enforces duplicate and per-account registration limits', async () => {
    await register()
    expect((await register()).response.status).toBe(409)
    const key = db.prepare('SELECT * FROM passkeys').get()
    for (let i = 0; i < 9; i++) db.prepare('INSERT INTO passkeys (id,account_id,public_key,counter,name,created_at) VALUES (?, ?, ?, 0, ?, 1)').run('key-' + i, key.account_id, key.public_key, 'Phone')
    expect((await call('/register/options', { cookie: familyCookie })).status).toBe(400)
    const others = await call('/register/options', { cookie: otherCookie })
    expect(others.status).toBe(200)
    expect((await others.json()).excludeCredentials).toEqual([])
  })
  it('checks origin, rate limits requests and applies migrations repeatedly', async () => {
    expect((await call('/login/options', { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await call('/login/options', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    const response = await call('/login/options')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=300')
    db.exec('UPDATE agent_login_attempts SET attempts = 100')
    expect((await call('/login/options')).status).toBe(429)
    const migration = readFileSync(new URL('../../migrate_passkeys.sql', import.meta.url), 'utf8')
    db.exec(migration); db.exec(migration)
  })
})
