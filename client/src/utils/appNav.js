/**
 * Cross-app header hub nav (Links / Chats / PDF / Stats).
 * Canonical order is Links → Chats → PDF → Stats. The current service is
 * pinned first so it stays visible at the start of the header; remaining
 * items keep that canonical relative order.
 */

export const APP_NAV_HREFS = Object.freeze({
  links: '/temecriack/links/',
  chats: '/temecriack/chats/',
  pdf: '/temecriack/pdf-compiler/',
  stats: '/temecriack/links/stats/',
})

const ICON_LINK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'
const ICON_CHATS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
const ICON_PDF =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
const ICON_STATS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'

const CANONICAL_NAV = Object.freeze([
  { key: 'navLinks', href: APP_NAV_HREFS.links, icon: ICON_LINK, label: 'Генерування посилань' },
  { key: 'navChats', href: APP_NAV_HREFS.chats, icon: ICON_CHATS, label: 'Вичитка акаунтів' },
  { key: 'navPdf', href: APP_NAV_HREFS.pdf, icon: ICON_PDF, label: 'PDF Compiler' },
  { key: 'navStats', href: APP_NAV_HREFS.stats, icon: ICON_STATS, label: 'Статистика' },
])

/**
 * Stats shares the `/temecriack/links` prefix, so Links must exclude `/stats`.
 * @param {string} pathname
 * @param {string} href
 * @returns {boolean}
 */
export function isAppNavActive(pathname, href) {
  const path = String(pathname || '')
  if (href === APP_NAV_HREFS.stats) {
    return path.startsWith('/temecriack/links/stats')
  }
  if (href === APP_NAV_HREFS.links) {
    return path.startsWith('/temecriack/links') && !path.startsWith('/temecriack/links/stats')
  }
  return path.startsWith(href.replace(/\/$/, ''))
}

/**
 * Pin active items first without reshuffling the rest.
 * @template {{ active?: boolean }} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function orderActiveNavFirst(items) {
  const active = []
  const rest = []
  for (const item of items) {
    if (item.active) active.push(item)
    else rest.push(item)
  }
  return [...active, ...rest]
}

/**
 * This SPA is always PDF Compiler: pin that item first even when the
 * browser path is `/` (direct container) or otherwise does not match
 * `/temecriack/pdf-compiler`.
 */
export const CURRENT_APP_KEY = 'navPdf'

/**
 * @param {string} [pathname]
 * @returns {Array<{ key: string, href: string, icon: string, label: string, active: boolean }>}
 */
export function buildAppNavItems(pathname = '') {
  const items = CANONICAL_NAV.map((item) => ({
    ...item,
    active: item.key === CURRENT_APP_KEY || isAppNavActive(pathname, item.href),
  }))
  return orderActiveNavFirst(items)
}
