import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertAccessToken,
  extractBearerOrCookie,
  requireAccessToken,
} from '../middleware/authLite.js'

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

function fakeJwt(payload) {
  return `hdr.${b64url(payload)}.sig`
}

describe('authLite', () => {
  it('extracts Bearer and cookie', () => {
    assert.equal(
      extractBearerOrCookie({
        headers: { authorization: 'Bearer abc.def.ghi' },
      }),
      'abc.def.ghi',
    )
    assert.equal(
      extractBearerOrCookie({
        headers: {
          cookie: 'other=1; temecriack-admin-token=tok.en.here; x=y',
        },
      }),
      'tok.en.here',
    )
  })

  it('accepts valid JWT and rejects missing/expired/malformed', () => {
    const ok = fakeJwt({
      username: 'alice',
      exp: Math.floor(Date.now() / 1000) + 600,
    })
    assert.equal(assertAccessToken(ok), 'alice')

    assert.throws(() => assertAccessToken(''), (e) => e.status === 401)
    assert.throws(() => assertAccessToken('not-a-jwt'), (e) => e.status === 401)
    assert.throws(
      () =>
        assertAccessToken(
          fakeJwt({ username: 'bob', exp: Math.floor(Date.now() / 1000) - 120 }),
        ),
      (e) => e.status === 401,
    )
  })

  it('requireAccessToken skips OPTIONS and sets adminUsername', async () => {
    let nextCalled = false
    requireAccessToken({ method: 'OPTIONS' }, {}, () => {
      nextCalled = true
    })
    assert.equal(nextCalled, true)

    const token = fakeJwt({
      username: 'ops',
      exp: Math.floor(Date.now() / 1000) + 600,
    })
    const req = {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    }
    await new Promise((resolve, reject) => {
      requireAccessToken(req, { status() { return this }, json: reject }, () => resolve())
    })
    assert.equal(req.adminUsername, 'ops')
  })
})
