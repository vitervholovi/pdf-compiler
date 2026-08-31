/**
 * Workspace allowlist for pdf-compiler pages + API.
 * Why: only Auth Admin workspace.id === "1" may use the app.
 * Confirmed wrong workspace → plain 404 (AUTH-02f). Profile/token failures are
 * not "denied" — SPA must still boot so the session SDK can refresh or redirect.
 */
import { createHash } from 'node:crypto'
import { extractBearerOrCookie } from './authLite.js'

export const ALLOWED_WORKSPACE_ID = '1'
const PROFILE_PATH = '/admin/auth/profile'
const CACHE_TTL_MS = 30_000
const PROFILE_FETCH_TIMEOUT_MS = 2500
const cache = new Map()

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeWorkspaceId(raw) {
  if (raw == null) return ''
  return String(raw).trim()
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isAllowedWorkspaceId(raw) {
  return normalizeWorkspaceId(raw) === ALLOWED_WORKSPACE_ID
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveAuthAdminBaseUrl(env = process.env) {
  return String(env.AUTH_ADMIN_URL || '').trim().replace(/\/+$/, '')
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function hasAuthAdminProfileVerifier(env = process.env) {
  return !!resolveAuthAdminBaseUrl(env)
}

function tokenCacheKey(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

export function clearWorkspaceProfileCache() {
  cache.clear()
}

/**
 * @param {unknown} body
 * @returns {{ username: string, workspaceId: string|null }}
 */
export function parseProfileWorkspace(body) {
  const data = body?.data && typeof body.data === 'object' ? body.data : body
  if (!data || typeof data !== 'object') {
    throw new Error('Auth profile response missing data')
  }
  const username = String(data.username || '').trim()
  if (!username) throw new Error('Auth profile has no username')
  const workspaceRaw = data.workspace && typeof data.workspace === 'object' ? data.workspace : null
  const workspaceId = workspaceRaw?.id != null ? normalizeWorkspaceId(workspaceRaw.id) : ''
  return {
    username,
    workspaceId: workspaceId || null,
  }
}

/**
 * Fetch workspace.id from Auth Admin profile. Throws on network/HTTP/parse failure.
 * @param {string} rawToken
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, skipCache?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<string|null>}
 */
async function fetchWorkspaceIdFromProfile(rawToken, opts = {}) {
  const token = String(rawToken || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Missing access token')

  const key = tokenCacheKey(token)
  if (!opts.skipCache) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.workspaceId
  }

  const baseUrl = String(opts.baseUrl || resolveAuthAdminBaseUrl(opts.env)).replace(/\/+$/, '')
  if (!baseUrl) throw new Error('AUTH_ADMIN_URL is not configured')

  const fetchImpl = opts.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available for Auth Admin profile')
  }

  let res
  try {
    res = await fetchImpl(`${baseUrl}${PROFILE_PATH}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new Error(`Auth profile request failed: ${err?.message || err}`)
  }

  if (!res.ok) {
    throw new Error(`Auth profile HTTP ${res.status}`)
  }

  let body
  try {
    body = await res.json()
  } catch {
    throw new Error('Auth profile response is not JSON')
  }

  const parsed = parseProfileWorkspace(body)
  cache.set(key, { workspaceId: parsed.workspaceId, expiresAt: Date.now() + CACHE_TTL_MS })
  return parsed.workspaceId
}

/**
 * @param {string} rawToken
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, skipCache?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<string|null>}
 */
export async function resolveWorkspaceIdForToken(rawToken, opts = {}) {
  try {
    return await fetchWorkspaceIdFromProfile(rawToken, opts)
  } catch {
    return null
  }
}

/**
 * AUTH-10 gate outcome when `AUTH_ADMIN_URL` is configured.
 * @typedef {'off'|'allowed'|'no_token'|'denied'|'unresolved'} WorkspaceGateResult
 */

/**
 * Resolve AUTH-10 without conflating missing/failed auth with wrong workspace.
 * Why: unauthenticated browsers need the SPA shell for SDK login redirect;
 * expired/unreachable profile must not look like a confirmed workspace deny
 * (that caused intermittent plain 404 for logged-in operators).
 *
 * @param {import('express').Request} req
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, skipCache?: boolean }} [opts]
 * @returns {Promise<WorkspaceGateResult>}
 */
export async function resolveWorkspaceGate(req, opts = {}) {
  const env = opts.env || process.env
  if (!hasAuthAdminProfileVerifier(env)) return 'off'

  const token = extractBearerOrCookie(req)
  if (!token) return 'no_token'

  try {
    const workspaceId = await fetchWorkspaceIdFromProfile(token, {
      env,
      fetchImpl: opts.fetchImpl,
      skipCache: opts.skipCache,
    })
    return isAllowedWorkspaceId(workspaceId) ? 'allowed' : 'denied'
  } catch {
    return 'unresolved'
  }
}

/**
 * When AUTH_ADMIN_URL is set, require workspace.id === "1".
 * Without it (local/legacy), the gate is off.
 * Missing token / unresolved profile → false (use {@link resolveWorkspaceGate} for SPA boot).
 *
 * @param {import('express').Request} req
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<boolean>}
 */
export async function requestHasAllowedWorkspace(req, opts = {}) {
  const gate = await resolveWorkspaceGate(req, opts)
  if (gate === 'off' || gate === 'allowed') return true
  return false
}

/**
 * Plain 404 text/plain (no HTML / no JSON body).
 * @param {import('express').Response} res
 */
export function sendPlainNotFound(res) {
  if (res.headersSent) return
  res.status(404)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end('Not Found')
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function requestPath(req) {
  return String(req.path || req.url || '').split('?')[0]
}

/**
 * @param {import('express').Response} res
 */
function sendUnauthorized(res) {
  if (res.headersSent) return
  res.status(401)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ error: 'Unauthorized' }))
}

/**
 * Express middleware: confirmed wrong workspace → plain 404.
 * SPA: missing/unresolved auth passes through for SDK login/refresh.
 * Internal /api/* (except health mounted earlier): require allowed (or gate off).
 * Skips OPTIONS.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAllowedWorkspace(req, res, next) {
  if (req.method === 'OPTIONS') {
    next()
    return
  }
  void resolveWorkspaceGate(req)
    .then((gate) => {
      if (gate === 'denied') {
        sendPlainNotFound(res)
        return
      }
      const isInternalApi = requestPath(req).startsWith('/api/')
      if (isInternalApi && gate !== 'off' && gate !== 'allowed') {
        sendUnauthorized(res)
        return
      }
      next()
    })
    .catch(() => {
      // Rare safety net: treat like unresolved (not confirmed deny).
      if (requestPath(req).startsWith('/api/')) {
        sendUnauthorized(res)
        return
      }
      next()
    })
}
