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

  it('requestHasAllowedWorkspace denies wrong workspace when AUTH_ADMIN_URL set', async () => {
    const env = { AUTH_ADMIN_URL: 'http://auth.example' }
    assert.equal(await requestHasAllowedWorkspace({ headers: {} }, { env }), false)

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

  it('requireAllowedWorkspace returns plain 404 when denied', async () => {
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
        requireAllowedWorkspace({ method: 'GET', headers: {} }, res, () => {
          nextCalled = true
          resolve()
        })
        setTimeout(resolve, 50)
      })
      assert.equal(nextCalled, false)
      assert.equal(res.statusCode, 404)
      assert.equal(ended, 'Not Found')
      assert.equal(headers['content-type'], 'text/plain; charset=utf-8')
    } finally {
      if (prev == null) delete process.env.AUTH_ADMIN_URL
      else process.env.AUTH_ADMIN_URL = prev
    }
  })
})
