/**
 * Workspace allowlist for pdf-compiler pages + API.
 * Why: only Auth Admin workspace.id === "1" may use the app; others get plain 404.
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
 * @param {string} rawToken
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch, skipCache?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {Promise<string|null>}
 */
export async function resolveWorkspaceIdForToken(rawToken, opts = {}) {
  const token = String(rawToken || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const key = tokenCacheKey(token)
  if (!opts.skipCache) {
    const hit = cache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.workspaceId
  }

  const baseUrl = String(opts.baseUrl || resolveAuthAdminBaseUrl(opts.env)).replace(/\/+$/, '')
  if (!baseUrl) return null

  const fetchImpl = opts.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') return null

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
  } catch {
    return null
  }

  if (!res.ok) return null

  let body
  try {
    body = await res.json()
  } catch {
    return null
  }

  try {
    const parsed = parseProfileWorkspace(body)
    cache.set(key, { workspaceId: parsed.workspaceId, expiresAt: Date.now() + CACHE_TTL_MS })
    return parsed.workspaceId
  } catch {
    return null
  }
}

/**
 * When AUTH_ADMIN_URL is set, require workspace.id === "1".
 * Without it (local/legacy), the gate is off.
 *
 * @param {import('express').Request} req
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<boolean>}
 */
export async function requestHasAllowedWorkspace(req, opts = {}) {
  const env = opts.env || process.env
  if (!hasAuthAdminProfileVerifier(env)) return true

  const token = extractBearerOrCookie(req)
  if (!token) return false

  const workspaceId = await resolveWorkspaceIdForToken(token, {
    env,
    fetchImpl: opts.fetchImpl,
  })
  return isAllowedWorkspaceId(workspaceId)
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
 * Express middleware: deny non-workspace-1 with plain 404.
 * Skips OPTIONS; /api/health is mounted before this middleware.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAllowedWorkspace(req, res, next) {
  if (req.method === 'OPTIONS') {
    next()
    return
  }
  void requestHasAllowedWorkspace(req)
    .then((ok) => {
      if (!ok) {
        sendPlainNotFound(res)
        return
      }
      next()
    })
    .catch(() => {
      sendPlainNotFound(res)
    })
}
