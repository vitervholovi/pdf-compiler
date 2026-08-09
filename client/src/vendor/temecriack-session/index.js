/**
 * TeMeCriack shared admin session SDK.
 * Canonical copy: auth/src/session — synced into chats/links vendor trees
 * via `scripts/sync-admin-session.sh` (do not edit vendors by hand).
 *
 * Post-login `returnTo`: {@link DEFAULT_RETURN_TO} (`/temecriack/auth/menu/`)
 * unless query/referrer is an allowlisted chats|links|pdf-compiler|auth/menu path.
 */

export {
  AUTH_API_PROXY,
  configureSession,
  login,
  logout,
  notifyAuthFailure,
  refresh,
  verifyLoginTwoFactor,
} from './api.js'

export {
  startSessionClock,
  stopSessionClock,
} from './clock.js'

export {
  requireSession,
} from './guard.js'

export {
  authFetch,
  installAxiosAuthInterceptor,
  shouldAttemptSessionRefresh,
} from './http.js'

export {
  decodeJwtPayload,
  extractUsernameFromToken,
  getTokenExp,
  isTokenExpired,
  isTokenExpiringSoon,
  msUntilRefresh,
} from './jwt.js'

export {
  LOGOUT_REASON_KEY,
  peekLogoutReason,
  recordLogoutReason,
} from './logoutReason.js'

export {
  extractErrorMessage,
  extractPendingToken,
  extractToken,
  unwrapData,
} from './payload.js'

export {
  AUTH_BASE,
  DEFAULT_RETURN_TO,
  LOGIN_URL,
  redirectToLogin,
  resolveReturnTo,
  safeReturnTo,
} from './redirect.js'

export {
  TOKEN_KEY,
  TOKEN_MAX_AGE_SEC,
  clearAccessToken,
  clearToken,
  getAccessToken,
  getToken,
  setAccessToken,
  setToken,
  setTokenChangeHandler,
} from './token.js'
