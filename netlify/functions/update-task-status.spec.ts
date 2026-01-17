import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './update-task-status'

vi.mock('mongodb')
vi.mock('../utils/auth')

describe('update-task-status endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-PATCH requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'POST',
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(405)
  })

  it('returns 204 for OPTIONS requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'OPTIONS',
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(204)
  })

  it('returns 401 when authorization header is missing', async () => {
    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'PATCH',
      body: JSON.stringify({ taskId: '123', status: 'COMPLETED' }),
    })

    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockRejectedValueOnce(new Error('Unauthorized'))

    const response = await handler(req, {} as any)
    expect(response.status).toBe(401)
  })

  it('returns 400 when request body is invalid JSON', async () => {
    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('test-user-123')

    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: 'invalid json',
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(400)
  })

  it('returns 400 when taskId or status is missing', async () => {
    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('test-user-123')

    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '123' }), // missing status
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(400)
  })

  it('returns 400 when status is invalid', async () => {
    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('test-user-123')

    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '123', status: 'INVALID_STATUS' }),
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(400)
  })
})
