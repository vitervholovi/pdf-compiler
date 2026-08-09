/** sessionStorage key for the last SPA logout / login-redirect reason (DevTools). */
export const LOGOUT_REASON_KEY = 'temecriack-logout-reason'

/**
 * @typedef {'boot_no_token' | 'boot_refresh_fail' | 'api_refresh_fail' | 'user_logout' | string} LogoutReason
 */

/**
 * Record why we are (about to) redirect to shared login.
 * @param {LogoutReason} reason
 * @param {{ detail?: string }} [opts]
 */
export function recordLogoutReason(reason, opts = {}) {
  const payload = {
    reason: String(reason || 'unknown'),
    at: new Date().toISOString(),
    ...(opts.detail ? { detail: String(opts.detail) } : {}),
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(LOGOUT_REASON_KEY, JSON.stringify(payload))
    }
  } catch {}
  try {
    console.info('[temecriack-session] redirect to login:', payload.reason, payload)
  } catch {}
}

/** @returns {{ reason: string, at: string, detail?: string } | null} */
export function peekLogoutReason() {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(LOGOUT_REASON_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}
