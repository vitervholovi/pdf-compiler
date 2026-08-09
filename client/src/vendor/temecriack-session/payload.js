/** Nest-style `{ data: {...} }` or flat payload. */
export function unwrapData(payload = {}) {
  if (
    payload &&
    typeof payload === 'object' &&
    payload.data &&
    typeof payload.data === 'object' &&
    !Array.isArray(payload.data)
  ) {
    return { ...payload, ...payload.data }
  }
  return payload || {}
}

export function extractToken(payload = {}) {
  const data = unwrapData(payload)
  return data.accessToken || data.access_token || data.token || data.jwt || null
}

export function extractPendingToken(payload = {}) {
  const data = unwrapData(payload)
  return (
    data.pendingToken ||
    data.pending_token ||
    data.twoFactorToken ||
    data.two_factor_token ||
    data.tempToken ||
    data.temp_token ||
    null
  )
}

export function extractErrorMessage(payload) {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload.message || payload.error
  if (Array.isArray(raw)) return raw.filter(Boolean).join(' ')
  if (typeof raw === 'string') return raw
  return null
}
