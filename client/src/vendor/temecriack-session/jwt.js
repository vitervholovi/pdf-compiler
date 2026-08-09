/** Decode JWT payload without verifying signature (client-side timing only). */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** @returns {number|null} exp in unix seconds */
export function getTokenExp(token) {
  const payload = decodeJwtPayload(token)
  const exp = payload?.exp
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
}

/** True when exp is present and already past (with optional skew seconds).
 * Missing/undecodable exp → false (do not treat opaque tokens as expired). */
export function isTokenExpired(token, skewSec = 0) {
  const exp = getTokenExp(token)
  if (exp == null) return false
  return Date.now() >= (exp - skewSec) * 1000
}

/** True when token will expire within skewSec (default 60s). */
export function isTokenExpiringSoon(token, skewSec = 60) {
  return isTokenExpired(token, skewSec)
}

export function extractUsernameFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== 'object') return ''
  const candidate =
    payload.username ||
    payload.userName ||
    payload.name ||
    payload.adminName ||
    payload.preferred_username ||
    payload.admin?.username ||
    payload.admin?.name ||
    ''
  if (candidate) return String(candidate)
  const sub = payload.sub != null ? String(payload.sub) : ''
  if (sub && !/^[0-9a-f-]{32,}$/i.test(sub.replace(/-/g, '')) && !/^\d+$/.test(sub)) {
    return sub
  }
  return ''
}

/** Ms until proactive refresh should run (exp - skew). Null if unknown/expired. */
export function msUntilRefresh(token, skewSec = 60) {
  const exp = getTokenExp(token)
  if (exp == null) return null
  const at = (exp - skewSec) * 1000
  const delta = at - Date.now()
  return delta > 0 ? delta : 0
}
