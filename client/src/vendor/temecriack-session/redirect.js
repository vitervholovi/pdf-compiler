import { recordLogoutReason } from './logoutReason.js'
import { clearAccessToken } from './token.js'

export const AUTH_BASE = '/temecriack/auth'
export const LOGIN_URL = `${AUTH_BASE}/login`

/**
 * Default post-login landing when no safe app path is available.
 * Service hub (`/menu`), not a single product app.
 */
export const DEFAULT_RETURN_TO = '/temecriack/auth/menu/'

/**
 * Prefixes allowed as post-login / SSO `returnTo` targets (open-redirect guard).
 * `/temecriack/auth/menu` only — never the whole `/temecriack/auth` tree
 * (would allow login/invite loops and phishing paths).
 */
const ALLOWED_RETURN_TO_PREFIXES = Object.freeze([
  '/temecriack/chats',
  '/temecriack/links',
  '/temecriack/pdf-compiler',
  '/temecriack/auth/menu',
])

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isAllowedReturnTo(value) {
  if (typeof value !== 'string') return false
  return ALLOWED_RETURN_TO_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * Allow only same-app relative paths under chats, links, pdf-compiler, or auth menu.
 * Unsafe values (external URLs, `/temecriack/auth/login`, arbitrary auth paths) collapse
 * to {@link DEFAULT_RETURN_TO}.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function safeReturnTo(value) {
  if (isAllowedReturnTo(value)) return value
  return DEFAULT_RETURN_TO
}

/**
 * Resolve post-login destination for the auth SPA / SSO bounce.
 * Priority: explicit allowed query value → same-origin referrer path → menu default.
 * An unsafe query does **not** short-circuit to default; referrer is tried next
 * (same behaviour as before the menu hub).
 *
 * @param {{
 *   queryValue?: string|null,
 *   referrer?: string|null,
 *   origin?: string,
 * }} [opts]
 * @returns {string}
 */
export function resolveReturnTo({
  queryValue,
  referrer,
  origin,
} = {}) {
  if (isAllowedReturnTo(queryValue)) {
    return /** @type {string} */ (queryValue)
  }

  if (referrer) {
    try {
      const base =
        origin ||
        (typeof window !== 'undefined' ? window.location.origin : undefined)
      const url = base ? new URL(referrer, base) : new URL(referrer)
      if (!base || url.origin === base) {
        return safeReturnTo(
          `${url.pathname}${url.search}${url.hash || ''}`,
        )
      }
    } catch {
      // Malformed referrer — fall through to default.
    }
  }

  return DEFAULT_RETURN_TO
}

/**
 * Send the browser to the shared auth login.
 * When `returnTo` is omitted and the current page is under `/temecriack/auth`,
 * falls back to same-origin `document.referrer` (chats/links/pdf) instead of the
 * auth URL itself (which would always collapse to the menu default).
 *
 * @param {{
 *   returnTo?: string,
 *   clear?: boolean,
 *   reason?: string,
 *   referrer?: string,
 * }} [opts]
 */
export function redirectToLogin({
  returnTo,
  clear = true,
  reason,
  referrer,
} = {}) {
  if (reason) recordLogoutReason(reason)
  else if (clear) recordLogoutReason('user_logout')
  if (clear) clearAccessToken()
  if (typeof window === 'undefined') return

  const currentPath =
    `${window.location.pathname}${window.location.search}${window.location.hash || ''}`
  const onAuthPage = window.location.pathname.startsWith(AUTH_BASE)

  let target
  if (returnTo != null) {
    target = resolveReturnTo({ queryValue: returnTo })
  } else if (onAuthPage) {
    target = resolveReturnTo({
      referrer:
        referrer ??
        (typeof document !== 'undefined' ? document.referrer : ''),
    })
  } else {
    target = safeReturnTo(currentPath)
  }

  const params = new URLSearchParams({ returnTo: target })
  window.location.replace(`${LOGIN_URL}?${params}`)
}
