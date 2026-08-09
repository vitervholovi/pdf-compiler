/**
 * Lightweight admin JWT gate for pdf-compiler API routes.
 * Structure + `exp` + username claim only — no AUTH_JWT_SECRET / JWKS
 * (same trust model as chats `authLite`; authenticity via gateway SSO cookie).
 */

const TOKEN_COOKIE = 'temecriack-admin-token'

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
export function extractBearerOrCookie(req) {
  const auth = req.headers.authorization || req.headers.Authorization || ''
  const m = String(auth).match(/^Bearer\s+(.+)$/i)
  if (m) return m[1].trim()

  const cookie = req.headers.cookie || ''
  const parts = cookie.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === TOKEN_COOKIE) {
      try {
        return decodeURIComponent(rest.join('=').trim())
      } catch {
        return rest.join('=').trim()
      }
    }
  }
  return ''
}

/**
 * @param {unknown} rawToken
 * @returns {string} username
 */
export function assertAccessToken(rawToken) {
  const token = String(rawToken || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    const err = new Error('Missing access token')
    err.status = 401
    throw err
  }
  const parts = token.split('.')
  if (parts.length !== 3) {
    const err = new Error('Malformed access token')
    err.status = 401
    throw err
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    const err = new Error('Malformed access token payload')
    err.status = 401
    throw err
  }
  if (!payload?.exp) {
    const err = new Error('Access token has no expiration')
    err.status = 401
    throw err
  }
  const username = payload.username || payload.sub || payload.user
  if (typeof username !== 'string' || !username.trim()) {
    const err = new Error('Access token has no username')
    err.status = 401
    throw err
  }
  // 60s skew matches client session boot / refresh windows.
  if (Number(payload.exp) * 1000 <= Date.now() - 60_000) {
    const err = new Error('Access token expired')
    err.status = 401
    throw err
  }
  return username.trim()
}

/**
 * Express middleware: require Bearer or `temecriack-admin-token` cookie.
 * Skips OPTIONS so CORS preflight is not blocked.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAccessToken(req, res, next) {
  if (req.method === 'OPTIONS') {
    next()
    return
  }
  try {
    req.adminUsername = assertAccessToken(extractBearerOrCookie(req))
    next()
  } catch (err) {
    res.status(err.status || 401).json({ error: err.message || 'Unauthorized' })
  }
}
