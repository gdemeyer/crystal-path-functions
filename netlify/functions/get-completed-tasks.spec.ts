import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './get-completed-tasks'

vi.mock('mongodb')
vi.mock('../utils/auth')

describe('get-completed-tasks endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 405 for non-GET requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/get-completed-tasks', {
      method: 'POST',
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(405)
  })

  it('returns 204 for OPTIONS requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/get-completed-tasks', {
      method: 'OPTIONS',
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(204)
  })

  it('returns 401 when authorization header is missing', async () => {
    const req = new Request('http://localhost/.netlify/functions/get-completed-tasks', {
      method: 'GET',
    })

    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockRejectedValueOnce(new Error('Unauthorized'))

    const response = await handler(req, {} as any)
    expect(response.status).toBe(401)
  })

  it('returns empty array when user has no completed tasks', async () => {
    const { validateToken } = await import('../utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('test-user-123')

    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValueOnce([])
        })
      })
    }

    const mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection)
    }

    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb)
    }

    const { MongoClient } = await import('mongodb')
    vi.mocked(MongoClient.connect).mockResolvedValueOnce(mockClient as any)

    const req = new Request('http://localhost/.netlify/functions/get-completed-tasks', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer dummy-token' },
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(200)
    const responseBody = await response.text()
    const tasks = JSON.parse(responseBody)
    expect(Array.isArray(tasks)).toBe(true)
    expect(tasks.length).toBe(0)
  })
})
