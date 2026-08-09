import { refresh } from './api.js'
import { getTokenExp, isTokenExpired, isTokenExpiringSoon } from './jwt.js'
import { redirectToLogin } from './redirect.js'
import { getAccessToken } from './token.js'

/**
 * Boot guard for chats/links.
 * - No access → login, no refresh probe.
 * - Access past/near exp → refresh; fail → login (no soft-mount).
 * - Opaque token (no exp) → trust until API 401 (no proactive refresh spam).
 * - localDev → trust stored token (HMR).
 *
 * @param {{ localDev?: boolean, skewSec?: number }} [opts]
 * @returns {Promise<boolean>}
 */
export async function requireSession({ localDev = false, skewSec = 60 } = {}) {
  const token = getAccessToken()
  if (!token) {
    redirectToLogin({ clear: false, reason: 'boot_no_token' })
    return false
  }
  if (localDev) return true

  // No exp claim → cannot schedule/proactively refresh safely; wait for 401.
  if (getTokenExp(token) == null) return true

  if (!isTokenExpired(token) && !isTokenExpiringSoon(token, skewSec)) {
    return true
  }

  try {
    await refresh()
    return true
  } catch {
    redirectToLogin({ clear: true, reason: 'boot_refresh_fail' })
    return false
  }
}
