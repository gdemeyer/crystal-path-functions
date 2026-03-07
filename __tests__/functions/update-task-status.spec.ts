import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from '../../netlify/functions/update-task-status.mts'
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

describe('update-task-status endpoint', () => {
  let mockInsertOne: any
  let mockFindOneAndUpdate: any
  let mockCollection: any
  let mockDb: any
  let mockClient: any

  // Create mocks ONCE - they will be reused across all tests
  mockInsertOne = vi.fn()
  mockFindOneAndUpdate = vi.fn()
  mockCollection = vi.fn(() => ({ 
    insertOne: mockInsertOne,
    findOneAndUpdate: mockFindOneAndUpdate 
  }))
  mockDb = vi.fn(() => ({ collection: mockCollection }))
  mockClient = { db: mockDb }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'

    // Set up default return values (can be overridden in individual tests)
    mockInsertOne.mockResolvedValue({ insertedId: 'clone-id-123' })
    mockFindOneAndUpdate.mockResolvedValue(null) // Default to not found

    // Mock MongoClient.connect to return our mock client
    const MongoClientMock = mongodb.MongoClient as any
    MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)
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

    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockRejectedValueOnce(new Error('Unauthorized'))

    const response = await handler(req, {} as any)
    expect(response.status).toBe(401)
  })

  it('returns 400 when request body is invalid JSON', async () => {
    const { validateToken } = await import('../../netlify/utils/auth')
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
    const { validateToken } = await import('../../netlify/utils/auth')
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
    const { validateToken } = await import('../../netlify/utils/auth')
    vi.mocked(validateToken).mockResolvedValueOnce('test-user-123')

    const req = new Request('http://localhost/.netlify/functions/update-task-status', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer dummy-token' },
      body: JSON.stringify({ taskId: '123', status: 'INVALID_STATUS' }),
    })

    const response = await handler(req, {} as any)
    expect(response.status).toBe(400)
  })
  
  describe('Repeat on completion - Duplicate guards', () => {
    it('No clone when repeatOnComplete is falsy', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      expect(mockInsertOne).not.toHaveBeenCalled()
    })

    it('No clone when previous status was already COMPLETED', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.COMPLETED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      expect(mockInsertOne).not.toHaveBeenCalled()
    })

    it('Clone created on NOT_STARTED → COMPLETED transition', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      expect(mockInsertOne).toHaveBeenCalledTimes(1)
    })
  })

  describe('Repeat on completion - Clone field verification', () => {
    it('Inserted clone has correct repeatingOriginId', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      expect(mockInsertOne).toHaveBeenCalledTimes(1)
      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.repeatingOriginId).toBe(originalTask._id)
    })

    it('Inserted clone has status: NOT_STARTED', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.status).toBe(TASK_STATUS.NOT_STARTED)
    })

    it('Inserted clone has eligibleAt in the future', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const nowBefore = Date.now()
      await handler(req, {} as any)
      const nowAfter = Date.now()

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.eligibleAt).toBeDefined()
      expect(cloneDoc.eligibleAt).toBeGreaterThan(nowAfter)
    })

    it('Inserted clone has computed score and scoreVersion', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.score).toBeDefined()
      expect(typeof cloneDoc.score).toBe('number')
      expect(cloneDoc.score).toBeGreaterThan(0)
      expect(cloneDoc.scoreVersion).toBeDefined()
      expect(typeof cloneDoc.scoreVersion).toBe('number')
    })

    it('Inserted clone copies title, urgency, impact, time, difficulty', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.title).toBe(originalTask.title)
      expect(cloneDoc.urgency).toBe(originalTask.urgency)
      expect(cloneDoc.impact).toBe(originalTask.impact)
      expect(cloneDoc.time).toBe(originalTask.time)
      expect(cloneDoc.difficulty).toBe(originalTask.difficulty)
    })

    it('Inserted clone copies repeatOnComplete: true', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.repeatOnComplete).toBe(true)
    })

    it('Inserted clone does NOT have original _id or statusChanged', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc._id).toBeUndefined()
      expect(cloneDoc.statusChanged).toBeUndefined()
    })

    it('Inserted clone has correct userId', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      expect(cloneDoc.userId).toBe('user-123')
    })
  })

  describe('Repeat on completion - Eligibility mapping', () => {
    it('Urgency 1 → eligibleAt is +14 days', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 1,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const nowBefore = Date.now()
      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      const expectedMin = nowBefore + 14 * 86400000
      const expectedMax = Date.now() + 14 * 86400000
      expect(cloneDoc.eligibleAt).toBeGreaterThanOrEqual(expectedMin)
      expect(cloneDoc.eligibleAt).toBeLessThanOrEqual(expectedMax)
    })

    it('Urgency 3 → eligibleAt is +3 days', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const nowBefore = Date.now()
      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      const expectedMin = nowBefore + 3 * 86400000
      const expectedMax = Date.now() + 3 * 86400000
      expect(cloneDoc.eligibleAt).toBeGreaterThanOrEqual(expectedMin)
      expect(cloneDoc.eligibleAt).toBeLessThanOrEqual(expectedMax)
    })

    it('Urgency 13 → eligibleAt is +1 day', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 13,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const nowBefore = Date.now()
      await handler(req, {} as any)

      const cloneDoc = mockInsertOne.mock.calls[0][0]
      const expectedMin = nowBefore + 1 * 86400000
      const expectedMax = Date.now() + 1 * 86400000
      expect(cloneDoc.eligibleAt).toBeGreaterThanOrEqual(expectedMin)
      expect(cloneDoc.eligibleAt).toBeLessThanOrEqual(expectedMax)
    })
  })

  describe('Repeat on completion - Rollback on clone failure', () => {
    it('Returns 500 if clone insert fails', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)
      mockInsertOne.mockRejectedValueOnce(new Error('Insert failed'))

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const response = await handler(req, {} as any)

      expect(response.status).toBe(500)
    })

    it('Rolls back original status on clone failure', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate
        .mockResolvedValueOnce(originalTask)  // First call: the update that completes the task
        .mockResolvedValueOnce({...originalTask, status: TASK_STATUS.NOT_STARTED}) // Second call: rollback
      mockInsertOne.mockRejectedValueOnce(new Error('Insert failed'))

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      await handler(req, {} as any)

      // findOneAndUpdate should have been called twice: once for the update, once for rollback
      expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(2)
    })
  })

  describe('Repeat on completion - Response shape', () => {
    it('Successful completion of repeating task returns 200 with original task', async () => {
      const originalTask = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Task',
        urgency: 3,
        impact: 8,
        time: 5,
        difficulty: 2,
        repeatOnComplete: true,
        userId: 'user-123',
        status: TASK_STATUS.NOT_STARTED,
        statusChanged: 1700000000000,
        score: 42.5,
        scoreVersion: 1
      }

      mockFindOneAndUpdate.mockResolvedValueOnce(originalTask)

      const req = new Request('http://localhost/.netlify/functions/update-task-status', {
        method: 'PATCH',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' },
        body: JSON.stringify({ taskId: '507f1f77bcf86cd799439011', status: TASK_STATUS.COMPLETED }),
      })

      const response = await handler(req, {} as any)

      expect(response.status).toBe(200)
      
      const body = await response.json()
      // Response should be the updated original task (with status COMPLETED), not the clone
      expect(body.status).toBe(TASK_STATUS.COMPLETED)
      expect(body.title).toBe(originalTask.title)
      // Clone should not have repeatingOriginId, but the response should be about the original
      expect(body.repeatingOriginId).toBeUndefined()
    })
  })
})
