import { getAccessToken, setAccessToken } from './token.js'
import { isTokenExpired } from './jwt.js'
import {
  extractErrorMessage,
  extractPendingToken,
  extractToken,
  unwrapData,
} from './payload.js'

export const AUTH_API_PROXY = '/temecriack/auth/api'

/** Skip duplicate proactive refreshes within this window when access is still valid. */
const REFRESH_COOLDOWN_MS = 60_000
const REFRESH_LOCK_NAME = 'temecriack-admin-refresh'
const REFRESH_LOCK_KEY = 'temecriack-admin-refresh-lock'
const REFRESH_DONE_KEY = 'temecriack-admin-refresh-done'
const REFRESH_LOCK_TTL_MS = 15_000
const REFRESH_WAIT_MS = 12_000
const REFRESH_POLL_MS = 50

let getApiBase = () => AUTH_API_PROXY
let refreshPromise = null
let lastSuccessfulRefreshAt = 0
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readLockMeta() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(REFRESH_LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function tryAcquireStorageLock(ownerId) {
  try {
    if (typeof localStorage === 'undefined') return true
    const now = Date.now()
    const existing = readLockMeta()
    if (existing?.at && now - Number(existing.at) < REFRESH_LOCK_TTL_MS) {
      return false
    }
    const payload = JSON.stringify({ ownerId, at: now })
    localStorage.setItem(REFRESH_LOCK_KEY, payload)
    const confirm = readLockMeta()
    return confirm?.ownerId === ownerId
  } catch {
    return true
  }
}

function releaseStorageLock(ownerId) {
  try {
    if (typeof localStorage === 'undefined') return
    const existing = readLockMeta()
    if (!existing || existing.ownerId === ownerId) {
      localStorage.removeItem(REFRESH_LOCK_KEY)
    }
  } catch {}
}

function publishRefreshDone(token) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      REFRESH_DONE_KEY,
      JSON.stringify({ token: token || '', at: Date.now() }),
    )
  } catch {}
}

/**
 * Wait until another tab finishes refresh (or lock TTL), then return current access token.
 * Throws when the peer never publishes a usable JWT — caller may retry owning the lock once.
 */
async function waitForPeerRefresh(startedAt, priorToken) {
  const deadline = startedAt + REFRESH_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(REFRESH_POLL_MS)
    const next = getAccessToken()
    if (next && next !== priorToken && !isTokenExpired(next, 0)) {
      lastSuccessfulRefreshAt = Date.now()
      return next
    }
    const lock = readLockMeta()
    if (!lock || Date.now() - Number(lock.at) >= REFRESH_LOCK_TTL_MS) {
      break
    }
  }
  const fallback = getAccessToken()
  if (fallback && !isTokenExpired(fallback, 0)) {
    lastSuccessfulRefreshAt = Date.now()
    return fallback
  }
  throw new Error('Peer refresh did not yield a valid access token')
}

/**
 * Run `fn` under the cross-tab refresh lock (Web Locks API, else localStorage).
 * If a peer holds the storage lock and never yields a token, acquire once more
 * and perform our own refresh before surfacing a terminal failure.
 * Own-refresh errors (e.g. upstream 401) are not retried here.
 */
async function withRefreshLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, async () => fn())
  }

  const ownerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const prior = getAccessToken()
  const startedAt = Date.now()

  if (tryAcquireStorageLock(ownerId)) {
    try {
      return await fn()
    } finally {
      releaseStorageLock(ownerId)
    }
  }

  try {
    return await waitForPeerRefresh(startedAt, prior)
  } catch (peerErr) {
    // Peer timed out without a usable JWT — one own-refresh attempt.
    const retryOwnerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    if (!tryAcquireStorageLock(retryOwnerId)) {
      throw peerErr
    }
    try {
      return await fn()
    } finally {
      releaseStorageLock(retryOwnerId)
    }
  }
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
 * Rotate access JWT using the httpOnly refresh cookie.
 * Never probe without an access token (reuse-detection risk).
 * Concurrent callers share one in-flight request; cross-tab callers share a lock.
 * Successful refreshes are coalesced for REFRESH_COOLDOWN_MS while access is still valid.
 */
export async function refresh() {
  const current = getAccessToken()
  if (!current) {
    throw new Error('No access token')
  }
  if (refreshPromise) return refreshPromise

  const recentlyRefreshed =
    lastSuccessfulRefreshAt > 0 &&
    Date.now() - lastSuccessfulRefreshAt < REFRESH_COOLDOWN_MS
  if (recentlyRefreshed && !isTokenExpired(current, 0)) {
    return current
  }

  refreshPromise = (async () => {
    return withRefreshLock(async () => {
      // Another tab may have refreshed while we waited for the lock.
      const latest = getAccessToken()
      if (latest && latest !== current && !isTokenExpired(latest, 0)) {
        lastSuccessfulRefreshAt = Date.now()
        return latest
      }
      const bearer = latest || current
      const recently =
        lastSuccessfulRefreshAt > 0 &&
        Date.now() - lastSuccessfulRefreshAt < REFRESH_COOLDOWN_MS
      if (recently && bearer && !isTokenExpired(bearer, 0)) {
        return bearer
      }

      const res = await fetch(authUrl('/admin/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${bearer}`,
        },
      })
      const data = await parseJsonResponse(res)
      if (!res.ok) {
        const error = throwAuthError(data, `Refresh failed: ${res.status}`)
        error.status = res.status
        throw error
      }
      const nextToken = extractToken(data)
      if (!nextToken) throw new Error('No access token in refresh response')
      setAccessToken(nextToken)
      lastSuccessfulRefreshAt = Date.now()
      publishRefreshDone(nextToken)
      return nextToken
    })
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
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
