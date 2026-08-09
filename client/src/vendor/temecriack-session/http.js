import { refresh, notifyAuthFailure } from './api.js'
import { isTokenExpired } from './jwt.js'
import { redirectToLogin } from './redirect.js'
import { getAccessToken } from './token.js'

/**
 * 401 → always try refresh (when Bearer was sent).
 * 403 → only when the sent access JWT is already expired (backends that misuse 403).
 */
export function shouldAttemptSessionRefresh(status, sentToken) {
  if (!sentToken) return false
  if (status === 401) return true
  if (status === 403 && isTokenExpired(sentToken, 0)) return true
  return false
}

function authPathExcluded(url) {
  try {
    const path = typeof url === 'string' ? url : String(url || '')
    return /\/(login|refresh|invite|logout)(\/|$|\?)/.test(path)
  } catch {
    return false
  }
}

/**
 * Fetch wrapper: attaches Bearer, credentials include optional,
 * 401 / expired-403 → single refresh + retry.
 *
 * @param {string} url
 * @param {RequestInit & { skipAuth?: boolean }} [init]
 */
export async function authFetch(url, init = {}, _retried = false) {
  const { skipAuth = false, headers: initHeaders, ...rest } = init
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
      await refresh()
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
 * Axios response interceptor: 401 / expired-403 → refresh + retry once.
 * Real 403 (valid JWT) passes through without logout.
 */
export function installAxiosAuthInterceptor(axiosInstance) {
  if (!axiosInstance || axiosInstance.__temecriackAuthInterceptorInstalled) return
  axiosInstance.__temecriackAuthInterceptorInstalled = true

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
          const next = await refresh()
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
