export const TOKEN_KEY = 'temecriack-admin-token'
/** Cookie Max-Age for access JWT string (3 days). JWT itself ~15 min; refresh cookie keeps session. */
export const TOKEN_MAX_AGE_SEC = 3 * 24 * 60 * 60

let memoryToken = null
let onTokenChanged = null

function readCookie(name) {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name, value, maxAgeSec) {
  if (typeof document === 'undefined') return
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? '; Secure'
      : ''
  if (value) {
    const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; Expires=${expires}; SameSite=Lax${secure}`
  } else {
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`
  }
}

export function setTokenChangeHandler(handler) {
  onTokenChanged = typeof handler === 'function' ? handler : null
}

/**
 * Cookie-first read so SSO tabs (chats↔links) pick up a token another tab refreshed.
 * Order: cookie → localStorage → in-memory.
 */
export function getAccessToken() {
  try {
    const fromCookie = readCookie(TOKEN_KEY)
    const fromStorage =
      typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    const external = fromCookie || fromStorage
    if (external && external !== memoryToken) {
      memoryToken = external
      if (fromCookie && fromCookie !== fromStorage) {
        try {
          localStorage.setItem(TOKEN_KEY, fromCookie)
        } catch {}
      }
      if (!fromCookie && fromStorage) writeCookie(TOKEN_KEY, fromStorage, TOKEN_MAX_AGE_SEC)
      return memoryToken
    }
    if (memoryToken) return memoryToken
  } catch {}
  return memoryToken
}

if (typeof window !== 'undefined' && !window.__temecriackTokenStorageBound) {
  window.__temecriackTokenStorageBound = true
  window.addEventListener('storage', (e) => {
    if (e.key !== TOKEN_KEY) return
    memoryToken = e.newValue || null
  })
}

export function setAccessToken(token) {
  memoryToken = token || null
  try {
    if (token) {
      writeCookie(TOKEN_KEY, token, TOKEN_MAX_AGE_SEC)
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      writeCookie(TOKEN_KEY, '', 0)
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {}
  onTokenChanged?.(token || '')
}

export function clearAccessToken() {
  setAccessToken(null)
}

/** @deprecated Prefer getAccessToken */
export const getToken = getAccessToken
/** @deprecated Prefer setAccessToken */
export const setToken = setAccessToken
/** @deprecated Prefer clearAccessToken */
export const clearToken = clearAccessToken
