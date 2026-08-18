/**
 * Authenticated fetch / axios helpers.
 *
 * Why: attach a broker-fresh Bearer before the app API call, then retry
 * once via GET `/session/access` on 401 / expired-403. Never POST refresh
 * from the browser. Login / 2FA / invite / logout / the broker path itself
 * must not enter this loop (pendingToken / recursion).
 */
import { ensureAccessToken, notifyAuthFailure } from './api.js'
import { isTokenExpired } from './jwt.js'
import { redirectToLogin } from './redirect.js'
import { getAccessToken } from './token.js'

/**
 * 401 → always try the broker (when Bearer was sent).
 * 403 → only when the sent access JWT is already expired (backends that misuse 403).
 *
 * @param {number} status
 * @param {string} sentToken
 * @returns {boolean}
 */
export function shouldAttemptSessionRefresh(status, sentToken) {
  if (!sentToken) return false
  if (status === 401) return true
  if (status === 403 && isTokenExpired(sentToken, 0)) return true
  return false
}

/**
 * Auth Admin + broker paths that must not trigger ensureAccessToken.
 * @param {string|URL} url
 */
function authPathExcluded(url) {
  try {
    const path = typeof url === 'string' ? url : String(url || '')
    return /\/(login|refresh|invite|logout|verify-2fa|session\/access)(\/|$|\?)/.test(
      path,
    )
  } catch {
    return false
  }
}

/**
 * Fetch wrapper: ensure access (if any), attach Bearer, credentials left to caller.
 * 401 / expired-403 → one forced broker GET + retry.
 *
 * @param {string} url
 * @param {RequestInit & { skipAuth?: boolean }} [init]
 * @returns {Promise<Response>}
 */
export async function authFetch(url, init = {}, _retried = false) {
  const { skipAuth = false, headers: initHeaders, ...rest } = init

  if (!_retried && !skipAuth && !authPathExcluded(url) && getAccessToken()) {
    try {
      await ensureAccessToken()
    } catch {
      // Keep the local JWT; the 401 branch below force-retries once.
    }
  }

  const token = skipAuth ? null : getAccessToken()
  const headers = {
    ...(rest.body && !(rest.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...initHeaders,
  }

  const res = await fetch(url, {
    ...rest,
    headers,
  })

  if (
    !_retried &&
    !skipAuth &&
    !authPathExcluded(url) &&
    shouldAttemptSessionRefresh(res.status, token)
  ) {
    const current = getAccessToken()
    if (current && current !== token) {
      return authFetch(url, init, true)
    }
    if (!token) {
      redirectToLogin({ clear: false, reason: 'boot_no_token' })
      return res
    }
    try {
      await ensureAccessToken({ force: true })
      return authFetch(url, init, true)
    } catch {
      notifyAuthFailure()
      redirectToLogin({ clear: true, reason: 'api_refresh_fail' })
      return res
    }
  }

  return res
}

/**
 * Axios: request interceptor ensures access; response 401 / expired-403
 * force-GETs the broker and retries once. Real 403 (valid JWT) passes through.
 *
 * @param {import('axios').AxiosInstance} axiosInstance
 */
export function installAxiosAuthInterceptor(axiosInstance) {
  if (!axiosInstance || axiosInstance.__temecriackAuthInterceptorInstalled) return
  axiosInstance.__temecriackAuthInterceptorInstalled = true

  axiosInstance.interceptors.request.use(async (config) => {
    if (config._adminAuthRetried) return config
    const url = `${config.baseURL || ''}${config.url || ''}`
    if (authPathExcluded(url)) return config
    const token = getAccessToken()
    if (!token) return config
    try {
      const next = await ensureAccessToken()
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${next}`
    } catch {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const request = error.config
      if (!request) throw error

      const authorization =
        request.headers?.Authorization || request.headers?.authorization || ''
      const status = error.response?.status
      const hasBearer = String(authorization).startsWith('Bearer ')
      const sentToken = hasBearer ? String(authorization).substring(7).trim() : ''

      if (!hasBearer || !shouldAttemptSessionRefresh(status, sentToken)) {
        throw error
      }

      const currentToken = String(getAccessToken() || '').trim()
      if (currentToken && currentToken !== sentToken) {
        request.headers.Authorization = `Bearer ${currentToken}`
        request._adminAuthRetried = true
        return axiosInstance(request)
      }

      if (!request._adminAuthRetried) {
        request._adminAuthRetried = true
        try {
          const next = await ensureAccessToken({ force: true })
          request.headers.Authorization = `Bearer ${next}`
          return axiosInstance(request)
        } catch {
          notifyAuthFailure()
          redirectToLogin({ clear: true, reason: 'api_refresh_fail' })
          throw error
        }
      }

      throw error
    },
  )
}
