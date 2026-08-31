import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  ALLOWED_WORKSPACE_ID,
  clearWorkspaceProfileCache,
  hasAuthAdminProfileVerifier,
  isAllowedWorkspaceId,
  parseProfileWorkspace,
  requestHasAllowedWorkspace,
  requireAllowedWorkspace,
  resolveWorkspaceGate,
  resolveWorkspaceIdForToken,
  sendPlainNotFound,
} from '../middleware/workspaceAccess.js'

afterEach(() => {
  clearWorkspaceProfileCache()
})

describe('workspaceAccess', () => {
  it('allowlists workspace id "1" only', () => {
    assert.equal(ALLOWED_WORKSPACE_ID, '1')
    assert.equal(isAllowedWorkspaceId('1'), true)
    assert.equal(isAllowedWorkspaceId(1), true)
    assert.equal(isAllowedWorkspaceId('2'), false)
    assert.equal(hasAuthAdminProfileVerifier({ AUTH_ADMIN_URL: '' }), false)
    assert.equal(
      hasAuthAdminProfileVerifier({ AUTH_ADMIN_URL: 'http://auth.example' }),
      true,
    )
  })

  it('parseProfileWorkspace reads workspace.id', () => {
    const parsed = parseProfileWorkspace({
      data: { username: 'ops', workspace: { id: '1' } },
    })
    assert.equal(parsed.workspaceId, '1')
  })

  it('resolveWorkspaceIdForToken uses Auth Admin profile', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { username: 'ops', workspace: { id: '1' } },
      }),
    })
    const id = await resolveWorkspaceIdForToken('tok', {
      baseUrl: 'http://auth.example',
      fetchImpl,
    })
    assert.equal(id, '1')
  })

  it('resolveWorkspaceGate returns unresolved on profile failure (not denied)', async () => {
    const env = { AUTH_ADMIN_URL: 'http://auth.example' }
    const fetchFail = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    assert.equal(
      await resolveWorkspaceGate(
        { headers: { authorization: 'Bearer expired.tok.en' } },
        { env, fetchImpl: fetchFail },
      ),
      'unresolved',
    )

    clearWorkspaceProfileCache()
    const fetchTimeout = async () => {
      throw new Error('timeout')
    }
    assert.equal(
      await resolveWorkspaceGate(
        { headers: { authorization: 'Bearer net.fail.tok' } },
        { env, fetchImpl: fetchTimeout },
      ),
      'unresolved',
    )
  })

  it('requestHasAllowedWorkspace denies wrong workspace when AUTH_ADMIN_URL set', async () => {
    const env = { AUTH_ADMIN_URL: 'http://auth.example' }
    assert.equal(await requestHasAllowedWorkspace({ headers: {} }, { env }), false)
    assert.equal(await resolveWorkspaceGate({ headers: {} }, { env }), 'no_token')

    const fetchWrong = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { username: 'ops', workspace: { id: '9' } },
      }),
    })
    assert.equal(
      await requestHasAllowedWorkspace(
        { headers: { authorization: 'Bearer wrong.tok.en' } },
        { env, fetchImpl: fetchWrong },
      ),
      false,
    )
    assert.equal(
      await resolveWorkspaceGate(
        { headers: { authorization: 'Bearer wrong.tok.en' } },
        { env, fetchImpl: fetchWrong },
      ),
      'denied',
    )

    clearWorkspaceProfileCache()
    const fetchOk = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { username: 'ops', workspace: { id: '1' } },
      }),
    })
    assert.equal(
      await requestHasAllowedWorkspace(
        { headers: { authorization: 'Bearer allow.tok.en' } },
        { env, fetchImpl: fetchOk },
      ),
      true,
    )
    assert.equal(
      await resolveWorkspaceGate(
        { headers: { authorization: 'Bearer allow.tok.en' } },
        { env, fetchImpl: fetchOk },
      ),
      'allowed',
    )

    clearWorkspaceProfileCache()
    const fetchNoWs = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { username: 'ops' },
      }),
    })
    assert.equal(
      await resolveWorkspaceGate(
        { headers: { authorization: 'Bearer nows.tok.en' } },
        { env, fetchImpl: fetchNoWs },
      ),
      'denied',
    )
  })

  it('sendPlainNotFound writes text/plain 404 without HTML', () => {
    const headers = {}
    const res = {
      headersSent: false,
      statusCode: 0,
      status(code) {
        this.statusCode = code
        return this
      },
      setHeader(k, v) {
        headers[k.toLowerCase()] = v
      },
      end(body) {
        this.body = body
      },
    }
    sendPlainNotFound(res)
    assert.equal(res.statusCode, 404)
    assert.equal(headers['content-type'], 'text/plain; charset=utf-8')
    assert.equal(res.body, 'Not Found')
    assert.equal(String(res.body).includes('<'), false)
  })

  it('requireAllowedWorkspace passes through when token is missing (SPA)', async () => {
    const prev = process.env.AUTH_ADMIN_URL
    process.env.AUTH_ADMIN_URL = 'http://auth.example'
    try {
      let nextCalled = false
      await new Promise((resolve) => {
        requireAllowedWorkspace(
          { method: 'GET', path: '/', headers: {} },
          { end() {} },
          () => {
            nextCalled = true
            resolve()
          },
        )
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, true)
    } finally {
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })

  it('requireAllowedWorkspace returns 401 for API when token is missing', async () => {
    const prev = process.env.AUTH_ADMIN_URL
    process.env.AUTH_ADMIN_URL = 'http://auth.example'
    try {
      const headers = {}
      let ended = ''
      const res = {
        headersSent: false,
        status(code) {
          this.statusCode = code
          return this
        },
        setHeader(k, v) {
          headers[k.toLowerCase()] = v
        },
        end(body) {
          ended = body
        },
      }
      let nextCalled = false
      await new Promise((resolve) => {
        requireAllowedWorkspace(
          { method: 'GET', path: '/api/jobs', headers: {} },
          res,
          () => {
            nextCalled = true
            resolve()
          },
        )
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, false)
      assert.equal(res.statusCode, 401)
      assert.equal(headers['content-type'], 'application/json; charset=utf-8')
      assert.equal(JSON.parse(ended).error, 'Unauthorized')
    } finally {
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })

  it('requireAllowedWorkspace passes SPA when profile is unresolved', async () => {
    const prev = process.env.AUTH_ADMIN_URL
    process.env.AUTH_ADMIN_URL = 'http://auth.example'
    clearWorkspaceProfileCache()
    const prevFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    try {
      let nextCalled = false
      let statusCode = 0
      await new Promise((resolve) => {
        requireAllowedWorkspace(
          {
            method: 'GET',
            path: '/',
            headers: { authorization: 'Bearer expired.tok.en' },
          },
          {
            headersSent: false,
            status(code) {
              statusCode = code
              return this
            },
            setHeader() {},
            end() {},
          },
          () => {
            nextCalled = true
            resolve()
          },
        )
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, true)
      assert.equal(statusCode, 0)
    } finally {
      globalThis.fetch = prevFetch
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })

  it('requireAllowedWorkspace returns 401 for API when profile is unresolved', async () => {
    const prev = process.env.AUTH_ADMIN_URL
    process.env.AUTH_ADMIN_URL = 'http://auth.example'
    clearWorkspaceProfileCache()
    const prevFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    try {
      const headers = {}
      let ended = ''
      const res = {
        headersSent: false,
        status(code) {
          this.statusCode = code
          return this
        },
        setHeader(k, v) {
          headers[k.toLowerCase()] = v
        },
        end(body) {
          ended = body
        },
      }
      let nextCalled = false
      await new Promise((resolve) => {
        requireAllowedWorkspace(
          {
            method: 'GET',
            path: '/api/jobs/abc',
            headers: { authorization: 'Bearer expired.tok.en' },
          },
          res,
          () => {
            nextCalled = true
            resolve()
          },
        )
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, false)
      assert.equal(res.statusCode, 401)
      assert.equal(headers['content-type'], 'application/json; charset=utf-8')
      assert.equal(JSON.parse(ended).error, 'Unauthorized')
    } finally {
      globalThis.fetch = prevFetch
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })

  it('requireAllowedWorkspace returns plain 404 when denied', async () => {
    const prev = process.env.AUTH_ADMIN_URL
    process.env.AUTH_ADMIN_URL = 'http://auth.example'
    clearWorkspaceProfileCache()
    const prevFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { username: 'ops', workspace: { id: '9' } },
      }),
    })
    try {
      const headers = {}
      let ended = ''
      const res = {
        headersSent: false,
        status(code) {
          this.statusCode = code
          return this
        },
        setHeader(k, v) {
          headers[k.toLowerCase()] = v
        },
        end(body) {
          ended = body
        },
      }
      let nextCalled = false
      await new Promise((resolve) => {
        requireAllowedWorkspace(
          {
            method: 'GET',
            path: '/',
            headers: { authorization: 'Bearer wrong.tok.en' },
          },
          res,
          () => {
            nextCalled = true
            resolve()
          },
        )
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, false)
      assert.equal(res.statusCode, 404)
      assert.equal(ended, 'Not Found')
      assert.equal(headers['content-type'], 'text/plain; charset=utf-8')
    } finally {
      globalThis.fetch = prevFetch
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })
})
