/**
 * Auth Admin session API client.
 *
 * Why: login / 2FA / logout stay on Auth Admin. Access rotation does not —
 * browser tabs must never POST `/admin/auth/refresh` (parallel rotations
 * false-logout). They GET `/session/access` on the auth Node broker instead.
 */
import { getAccessToken, setAccessToken } from './token.js'
import { isTokenExpired } from './jwt.js'
import {
  extractErrorMessage,
  extractPendingToken,
  extractToken,
  unwrapData,
} from './payload.js'

export const AUTH_API_PROXY = '/temecriack/auth/api'

/** Same-origin path under {@link AUTH_API_PROXY} → auth Node `GET /api/session/access`. */
export const SESSION_ACCESS_PATH = '/session/access'

/** Matches auth Node broker skew — treat access as stale this far before `exp`. */
export const ACCESS_SKEW_SEC = 60

let getApiBase = () => AUTH_API_PROXY
/** In-tab single-flight for broker GET. Cross-tab coalescing is the Node broker. */
let ensurePromise = null
let onAuthFailure = null

/**
 * @param {{
 *   apiBase?: string,
 *   getApiBase?: () => string,
 *   onAuthFailure?: () => void,
 * }} [options]
 */
export function configureSession(options = {}) {
  if (typeof options.getApiBase === 'function') {
    getApiBase = options.getApiBase
  } else if (typeof options.apiBase === 'string' && options.apiBase) {
    const base = options.apiBase
    getApiBase = () => base
  }
  if (typeof options.onAuthFailure === 'function') {
    onAuthFailure = options.onAuthFailure
  }
}

export function notifyAuthFailure() {
  onAuthFailure?.()
}

function authUrl(path) {
  return String(getApiBase() || AUTH_API_PROXY).replace(/\/+$/, '') + path
}

async function parseJsonResponse(res) {
  const text = await res.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  return data
}

function throwAuthError(data, fallback) {
  const error = new Error(extractErrorMessage(data) || fallback)
  error.data = data
  return error
}

/**
 * True when the JWT can be sent without asking the broker.
 * Missing/undecodable `exp` → usable (opaque; wait for API 401).
 *
 * @param {string|null|undefined} token
 * @param {number} [skewSec]
 * @returns {boolean}
 */
export function isAccessUsable(token, skewSec = ACCESS_SKEW_SEC) {
  if (!token || typeof token !== 'string') return false
  return !isTokenExpired(token, skewSec)
}

export async function login(username, password) {
  const res = await fetch(authUrl('/admin/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await parseJsonResponse(res)
  if (!res.ok) {
    const error = throwAuthError(data, `Login failed: ${res.status}`)
    error.status = res.status
    throw error
  }

  const pendingToken = extractPendingToken(data)
  const requires2fa = unwrapData(data).requires2fa === true || !!pendingToken
  if (requires2fa && pendingToken) {
    const error = new Error('Two-factor authentication required')
    error.code = 'TWO_FACTOR_REQUIRED'
    error.pendingToken = pendingToken
    error.status = res.status
    error.data = data
    throw error
  }

  const token = extractToken(data)
  if (!token) throw new Error('No access token in response')
  setAccessToken(token)
  return token
}

export async function verifyLoginTwoFactor(pendingToken, code, username = '') {
  const res = await fetch(authUrl('/admin/auth/login/verify-2fa'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pendingToken}`,
    },
    body: JSON.stringify({
      pendingToken,
      code,
      otp: code,
      ...(username ? { username } : {}),
    }),
  })
  const data = await parseJsonResponse(res)
  if (!res.ok) {
    const error = throwAuthError(data, `2FA verification failed: ${res.status}`)
    error.status = res.status
    throw error
  }
  const token = extractToken(data)
  if (!token) throw new Error('No access token in 2FA response')
  setAccessToken(token)
  return token
}

/**
 * Return a usable access JWT via the auth Node broker.
 *
 * Why: one `GET /temecriack/auth/api/session/access` (`credentials: include`)
 * replaces client `POST /admin/auth/refresh`. No probe when the access
 * cookie is missing (reuse-detection). Concurrent callers in this tab share
 * one in-flight Promise; the Node broker single-flights across tabs.
 *
 * @param {{ force?: boolean }} [opts] `force` hits the broker even if local
 *   access still looks valid (API 401 / expired-403 retry).
 * @returns {Promise<string>}
 */
export async function ensureAccessToken(opts = {}) {
  const force = opts.force === true
  const current = getAccessToken()
  if (!current) {
    throw new Error('No access token')
  }
  if (ensurePromise) return ensurePromise
  if (!force && isAccessUsable(current)) {
    return current
  }

  ensurePromise = (async () => {
    const latest = getAccessToken()
    if (!force && latest && isAccessUsable(latest)) {
      return latest
    }
    const bearer = latest || current
    if (!bearer) {
      throw new Error('No access token')
    }

    const res = await fetch(authUrl(SESSION_ACCESS_PATH), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${bearer}`,
      },
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      const error = throwAuthError(data, `Session access failed: ${res.status}`)
      error.status = res.status
      throw error
    }
    const nextToken = extractToken(data)
    if (!nextToken) throw new Error('No access token in session access response')
    setAccessToken(nextToken)
    return nextToken
  })().finally(() => {
    ensurePromise = null
  })
  return ensurePromise
}

/**
 * Alias of {@link ensureAccessToken} (no `force`) so App.vue / child clocks
 * keep compiling until those call sites switch or clocks are removed.
 *
 * @returns {Promise<string>}
 */
export async function refresh() {
  return ensureAccessToken()
}

export async function logout() {
  const token = getAccessToken()
  try {
    await fetch(authUrl('/admin/auth/logout'), {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {}
}
