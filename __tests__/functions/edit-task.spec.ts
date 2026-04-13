import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from '../../netlify/functions/edit-task.mts'
import * as mongodb from 'mongodb'
import { TASK_STATUS } from '../../consts-status'

vi.mock('mongodb')
vi.mock('../../netlify/utils/auth', () => ({
  validateToken: vi.fn((token) => {
    if (!token) throw new Error('Missing Authorization header')
    if (!token.includes('Bearer')) throw new Error('Invalid Authorization header format')
    if (token === 'Bearer dummy-token-user-123') return Promise.resolve('user-123')
    if (token === 'Bearer invalid-token') return Promise.reject(new Error('Token verification failed: Invalid token'))
    throw new Error('Invalid token')
  })
}))

describe('edit-task endpoint', () => {
  let mockFindOneAndUpdate: ReturnType<typeof vi.fn>
  let mockCollection: ReturnType<typeof vi.fn>
  let mockDb: ReturnType<typeof vi.fn>
  let mockClient: { db: ReturnType<typeof vi.fn> }

  mockFindOneAndUpdate = vi.fn()
  mockCollection = vi.fn(() => ({
    findOneAndUpdate: mockFindOneAndUpdate,
  }))
  mockDb = vi.fn(() => ({ collection: mockCollection }))
  mockClient = { db: mockDb }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'

    mockFindOneAndUpdate.mockResolvedValue(null)

    const MongoClientMock = mongodb.MongoClient as unknown as { connect: ReturnType<typeof vi.fn> }
    MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)
  })

  it('returns 405 for non-PUT requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'POST',
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(405)
  })

  it('returns 204 for OPTIONS requests', async () => {
    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'OPTIONS',
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(204)
  })

  it('returns 401 when authorization header is missing', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockRejectedValueOnce(new Error('Unauthorized'))

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(401)
  })

  it('returns 400 when request body is invalid JSON', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: 'invalid json',
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
  })

  it('returns 400 when taskId is missing', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('taskId')
  })

  it('returns 400 when task data is invalid', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T' }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
  })

  it('returns 400 when task title is empty', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: '  ', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
  })

  it('returns 400 when numeric fields are outside Fibonacci set', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'Test', difficulty: 4, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Numeric fields must be one of')
  })

  it('returns 400 when title exceeds maximum length', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const longTitle = 'a'.repeat(501)
    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: longTitle, difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('maximum length')
  })

  it('returns 400 when taskId has invalid ObjectId format', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    // Make ObjectId constructor throw for invalid IDs
    const ObjectIdMock = mongodb.ObjectId as unknown as ReturnType<typeof vi.fn>
    ObjectIdMock.mockImplementationOnce(() => { throw new Error('Invalid ObjectId') })

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: 'not-a-valid-id', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Invalid task ID')
  })

  it('returns 404 when task not found', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    mockFindOneAndUpdate.mockResolvedValueOnce(null)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(404)
  })

  it('returns 200 with updated task on success', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    // findOneAndUpdate with returnDocument: 'after' returns the updated doc
    const updatedTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'New Title',
      difficulty: 3,
      impact: 8,
      time: 2,
      urgency: 13,
      userId: 'user-123',
      status: TASK_STATUS.NOT_STARTED,
      statusChanged: 1700000000000,
      score: 35.0,
      scoreVersion: 2,
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(updatedTask)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'New Title', difficulty: 3, impact: 8, time: 2, urgency: 13 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.title).toBe('New Title')
    expect(body.difficulty).toBe(3)
    expect(body.impact).toBe(8)
    expect(body.time).toBe(2)
    expect(body.urgency).toBe(13)
  })

  it('uses $set with whitelisted fields only', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const existingTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Old',
      difficulty: 5,
      impact: 5,
      time: 5,
      urgency: 5,
      userId: 'user-123',
      status: TASK_STATUS.NOT_STARTED,
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(existingTask)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'New', difficulty: 3, impact: 8, time: 2, urgency: 13 }),
    })

    await handler(req, {} as never)

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1)
    const [filter, update, options] = mockFindOneAndUpdate.mock.calls[0]
    expect(filter).toEqual({ _id: expect.anything(), userId: 'user-123' })
    expect(update.$set.title).toBe('New')
    expect(update.$set.difficulty).toBe(3)
    expect(update.$set.impact).toBe(8)
    expect(update.$set.time).toBe(2)
    expect(update.$set.urgency).toBe(13)
    expect(update.$set.score).toBeDefined()
    expect(update.$set.scoreVersion).toBeDefined()
    // Should NOT include status, statusChanged, userId, eligibleAt, repeatingOriginId
    expect(update.$set.status).toBeUndefined()
    expect(update.$set.statusChanged).toBeUndefined()
    expect(update.$set.userId).toBeUndefined()
    expect(update.$set.eligibleAt).toBeUndefined()
    expect(update.$set.repeatingOriginId).toBeUndefined()
    expect(options).toEqual({ returnDocument: 'after' })
  })

  it('includes repeatOnComplete when true', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const existingTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'T',
      difficulty: 1,
      impact: 1,
      time: 1,
      urgency: 1,
      userId: 'user-123',
      status: TASK_STATUS.NOT_STARTED,
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(existingTask)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1, repeatOnComplete: true }),
    })

    await handler(req, {} as never)

    const update = mockFindOneAndUpdate.mock.calls[0][1]
    expect(update.$set.repeatOnComplete).toBe(true)
  })

  it('removes repeatOnComplete when false', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const existingTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'T',
      difficulty: 1,
      impact: 1,
      time: 1,
      urgency: 1,
      repeatOnComplete: true,
      userId: 'user-123',
      status: TASK_STATUS.NOT_STARTED,
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(existingTask)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    await handler(req, {} as never)

    const [, update] = mockFindOneAndUpdate.mock.calls[0]
    expect(update.$unset).toEqual({ repeatOnComplete: '' })
  })

  it('strips score and scoreVersion from response', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const updatedTask = {
      _id: '507f1f77bcf86cd799439011',
      title: 'T',
      difficulty: 1,
      impact: 1,
      time: 1,
      urgency: 1,
      userId: 'user-123',
      status: TASK_STATUS.NOT_STARTED,
      score: 42.5,
      scoreVersion: 2,
    }
    mockFindOneAndUpdate.mockResolvedValueOnce(updatedTask)

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    const body = await response.json()
    expect(body.score).toBeUndefined()
    expect(body.scoreVersion).toBeUndefined()
  })

  it('returns 500 on MongoDB connection failure', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('user-123')

    const MongoClientMock = mongodb.MongoClient as unknown as { connect: ReturnType<typeof vi.fn> }
    MongoClientMock.connect = vi.fn().mockRejectedValueOnce(new Error('Connection failed'))

    const req = new Request('http://localhost/.netlify/functions/edit-task', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', title: 'T', difficulty: 1, impact: 1, time: 1, urgency: 1 }),
    })

    const response = await handler(req, {} as never)
    expect(response.status).toBe(500)
  })
})
