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

export async function signSession(userId, secret) {
  const exp = Date.now() + SESSION_DURATION_MS
  const payloadB64 = toBase64url(new TextEncoder().encode(JSON.stringify({ uid: userId, exp })))
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return { token: `${payloadB64}.${toBase64url(sig)}`, expiresAt: exp }
}

export async function verifySession(token, secret) {
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
    if (!Number.isSafeInteger(payload.uid) || payload.uid <= 0 || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return { valid: false }

    return { valid: true, userId: payload.uid }
  } catch {
    return { valid: false }
  }
}

export async function validateInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return { valid: false }
    params.delete('hash')
    const authDate = Number(params.get('auth_date'))
    const now = Date.now() / 1000
    if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > 86400 || authDate > now + 60) return { valid: false }

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
    if (!Number.isSafeInteger(user.id) || user.id <= 0) return { valid: false }
    return { valid: true, userId: user.id, name: user.first_name || 'Telegram' }
  } catch {
    return { valid: false }
  }
}

