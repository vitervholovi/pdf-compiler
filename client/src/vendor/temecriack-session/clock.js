import { refresh } from './api.js'
import { isTokenExpired, msUntilRefresh } from './jwt.js'
import { getAccessToken, setTokenChangeHandler } from './token.js'

const DEFAULT_SKEW_SEC = 60
/** Never schedule proactive refresh more often than this. */
const MIN_DELAY_MS = 60_000
const MAX_DELAY_MS = 14 * 60 * 1000
/** When JWT has no exp claim, fall back to a calm fixed interval. */
const UNKNOWN_EXP_INTERVAL_MS = 10 * 60 * 1000
/** Ignore focus/visibility storms right after a refresh attempt. */
const VISIBILITY_COOLDOWN_MS = 60_000
/** Cap consecutive proactive failures before pausing the clock. */
const MAX_FAILURES = 2
const BACKOFF_BASE_MS = 60_000

let timerId = null
let started = false
let skewSec = DEFAULT_SKEW_SEC
let onRefreshFailed = null
let lastAttemptAt = 0
let consecutiveFailures = 0
let pausedAfterFailures = false

function clearTimer() {
  if (timerId != null) {
    clearTimeout(timerId)
    timerId = null
  }
}

async function runRefresh({ force = false } = {}) {
  if (!getAccessToken()) return
  const now = Date.now()
  if (!force && now - lastAttemptAt < VISIBILITY_COOLDOWN_MS) {
    scheduleNext()
    return
  }
  lastAttemptAt = now
  try {
    await refresh()
    consecutiveFailures = 0
    pausedAfterFailures = false
    scheduleNext()
  } catch (e) {
    consecutiveFailures += 1
    onRefreshFailed?.(e)
    if (consecutiveFailures >= MAX_FAILURES) {
      // Pause timers; visibility can still force a retry when access is due/expired.
      pausedAfterFailures = true
      clearTimer()
      return
    }
    const backoff = Math.min(
      MAX_DELAY_MS,
      BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1),
    )
    clearTimer()
    if (!started || typeof window === 'undefined') return
    timerId = window.setTimeout(() => {
      void runRefresh()
    }, backoff)
  }
}

function scheduleNext() {
  clearTimer()
  if (!started || typeof window === 'undefined' || pausedAfterFailures) return
  const token = getAccessToken()
  if (!token) return

  let delay = msUntilRefresh(token, skewSec)
  if (delay == null) {
    delay = UNKNOWN_EXP_INTERVAL_MS
  } else if (delay === 0) {
    // Due now, but never tighter than MIN_DELAY (cooldown also guards).
    delay = MIN_DELAY_MS
  }
  delay = Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, delay))

  timerId = window.setTimeout(() => {
    void runRefresh()
  }, delay)
}

function onVisibility() {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
  const token = getAccessToken()
  if (!token) return

  const due = msUntilRefresh(token, skewSec)
  const expired = isTokenExpired(token, 0)
  /** Refresh is warranted when skew window hit (due===0) or exp already past. */
  const dueOrExpired = due === 0 || expired

  // After pause: always bypass VISIBILITY_COOLDOWN so a returning tab can recover
  // even when the token is only near-exp (not yet hard-expired).
  if (pausedAfterFailures && dueOrExpired) {
    pausedAfterFailures = false
    void runRefresh({ force: true })
    return
  }

  if (dueOrExpired) {
    void runRefresh({ force: false })
  } else if (!pausedAfterFailures) {
    scheduleNext()
  }
}

/**
 * Exp-based session clock: refresh near JWT expiry; re-check on tab visible.
 * After limited backoff failures the clock pauses (no spin); visibility retries
 * with force when access is due or expired. Does not redirect to login —
 * API/guard own logout.
 * @param {{
 *   onToken?: (token: string) => void,
 *   onRefreshFailed?: (err: Error) => void,
 *   skewSec?: number,
 * }} [opts]
 */
export function startSessionClock(opts = {}) {
  stopSessionClock()
  skewSec = typeof opts.skewSec === 'number' ? opts.skewSec : DEFAULT_SKEW_SEC
  onRefreshFailed = typeof opts.onRefreshFailed === 'function' ? opts.onRefreshFailed : null
  if (opts.onToken) setTokenChangeHandler(opts.onToken)
  started = true
  consecutiveFailures = 0
  pausedAfterFailures = false
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility)
  }
  scheduleNext()
}

export function stopSessionClock() {
  started = false
  clearTimer()
  onRefreshFailed = null
  consecutiveFailures = 0
  pausedAfterFailures = false
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
