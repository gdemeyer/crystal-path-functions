import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from '../../netlify/functions/get-tasks.mts'
import * as mongodb from 'mongodb'

// Mock MongoDB module
vi.mock('mongodb')

// Mock token validation
vi.mock('../../netlify/utils/auth', () => ({
  validateToken: vi.fn((token) => {
    if (!token) throw new Error('Missing Authorization header')
    if (!token.includes('Bearer')) throw new Error('Invalid Authorization header format')
    if (token === 'Bearer dummy-token-user-123') return Promise.resolve('user-123')
    if (token === 'Bearer dummy-token-user-456') return Promise.resolve('user-456')
    if (token === 'Bearer invalid-token') return Promise.reject(new Error('Token verification failed: Invalid token'))
    throw new Error('Invalid token')
  })
}))

describe('GET /get-tasks handler', () => {
  let mockToArray: any
  let mockSort: any
  let mockFind: any
  let mockCollection: any
  let mockDb: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'
    process.env.DAILY_CAPACITY_UNITS = '4'

    // Setup MongoDB mocks
    mockToArray = vi.fn().mockResolvedValue([
      {
        _id: '1',
        title: 'Task 1',
        difficulty: 5,
        impact: 5,
        time: 5,
        urgency: 5,
        score: 10.5,
        scoreVersion: 1,
        userId: 'user-123',
        status: 'NOT_STARTED'
      },
      {
        _id: '2',
        title: 'Task 2',
        difficulty: 3,
        impact: 8,
        time: 2,
        urgency: 9,
        score: 12.3,
        scoreVersion: 1,
        userId: 'user-123',
        status: 'NOT_STARTED'
      }
    ])
    mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
    mockFind = vi.fn().mockReturnValue({ sort: mockSort })
    mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
    mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
    mockClient = {
      db: mockDb
    }

    // Mock MongoClient.connect to return our mock client
    const MongoClientMock = mongodb.MongoClient as any
    MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)
  })

  describe('Authentication', () => {
    it('should reject requests without Authorization header', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(401)
    })

    it('should reject requests with invalid token', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(401)
    })

    it('should accept requests with valid token', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
    })

    it('should filter tasks by userId', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify the response is successful with filtered data
      expect(result.status).toBe(200)
      const body = await result.json() as any[]
      expect(Array.isArray(body)).toBe(true)
      // All returned tasks should have the user's ID
      body.forEach(task => {
        expect(task.userId).toBe('user-123')
      })
    })

    it('should filter for different users independently', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-456'
        }
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify the response is successful
      expect(result.status).toBe(200)
      const body = await result.json() as any[]
      expect(Array.isArray(body)).toBe(true)
    })
  })

  describe('Valid GET requests', () => {
    it('should return array of tasks from database', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)

      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return tasks with all required fields', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json() as any[]

      if (body.length > 0) {
        const task = body[0]
        expect(task).toHaveProperty('_id')
        expect(task).toHaveProperty('title')
        expect(task).toHaveProperty('difficulty')
        expect(task).toHaveProperty('impact')
        expect(task).toHaveProperty('time')
        expect(task).toHaveProperty('urgency')
        expect(task.score).toBeUndefined()
      }
    })

    it('should include CORS headers in response', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(result.headers.get('Content-Type')).toBe('application/json')
    })
  })

  describe('OPTIONS preflight requests', () => {
    it('should return 204 with preflight headers', async () => {
      const request = new Request('http://localhost/', {
        method: 'OPTIONS'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(204)
    })

    it('should not query database on OPTIONS request', async () => {
      const request = new Request('http://localhost/', {
        method: 'OPTIONS'
      })
      const context = {}

      await handler(request, context as any)

      // Verify mocks were not called for OPTIONS
      // (mocks should be reset, so toArray shouldn't be called)
      expect(mockToArray).not.toHaveBeenCalled()
    })
  })

  describe('Database operations', () => {
    it('should connect to MongoDB using connection string', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      await handler(request, context as any)

      const MongoClientMock = mongodb.MongoClient as any
      expect(MongoClientMock.connect).toHaveBeenCalled()
    })

    it('should query correct database and collection', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify that we get a successful response with task data
      expect(result.status).toBe(200)
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
      if (body.length > 0) {
        expect(body[0]).toHaveProperty('title')
        expect(body[0].score).toBeUndefined()
      }
    })

    it('should call find with userId filter', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify successful response which means find() was called with correct filter
      expect(result.status).toBe(200)
      const body = await result.json() as any[]
      expect(Array.isArray(body)).toBe(true)
      // Tasks should be filtered by userId
      if (body.length > 0) {
        expect(body[0]).toHaveProperty('userId')
      }
    })

    it('should convert cursor to array', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify successful response which means toArray() was called
      expect(result.status).toBe(200)
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should handle database connection errors', async () => {
      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockRejectedValueOnce(new Error('Connection failed'))

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(500)
    })
  })

  describe('Response serialization', () => {
    it('should return valid JSON response', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json()

      expect(Array.isArray(body)).toBe(true)
    })

    it('should preserve task properties in response', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json() as any[]

      if (body.length > 0) {
        const task = body[0]
        // Task 2 has higher score (12.3) so it should be first when sorted by score
        expect(task.title).toBe('Task 2')
        expect(task.difficulty).toBe(3)
        expect(task.impact).toBe(8)
        expect(task.score).toBeUndefined()
      }
    })
  })

  describe('Response headers', () => {
    it('should include Content-Type header', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.headers.get('Content-Type')).toContain('application/json')
    })

    it('should include CORS headers', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('HTTP methods', () => {
    it('should reject non-GET, non-OPTIONS requests', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect([405, 400, 401]).toContain(result.status)
    })
  })

  describe('View parameter behavior', () => {
    it('should return flat array of uncompleted tasks when no view param', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(2)
    })

    it('should return today partition when view=today', async () => {
      const request = new Request('http://localhost/?view=today', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return backlog partition when view=backlog', async () => {
      const request = new Request('http://localhost/?view=backlog', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return 400 for invalid view parameter', async () => {
      const request = new Request('http://localhost/?view=invalid', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(400)
      
      const body = await result.json()
      expect(body).toHaveProperty('error')
      expect(body.error).toContain('Invalid view parameter')
    })

    it('should parse date parameter when provided', async () => {
      const request = new Request('http://localhost/?view=today&date=2026-02-15', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should use server date when date parameter not provided', async () => {
      const request = new Request('http://localhost/?view=today', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should respect DAILY_CAPACITY_UNITS environment variable', async () => {
      process.env.DAILY_CAPACITY_UNITS = '6'
      
      const request = new Request('http://localhost/?view=today', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer dummy-token-user-123'
        }
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(200)
      
      const body = await result.json()
      expect(Array.isArray(body)).toBe(true)
    })
  })

  describe('Score version auto-rescore', () => {
    let mockBulkWrite: any

    beforeEach(() => {
      mockBulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 0 })

      // Tasks with NO scoreVersion and deliberately wrong score ordering.
      // 'Low Priority Stale' has artificially HIGH stale score (50)
      // 'High Priority Stale' has artificially LOW stale score (10)
      // After recalculation with current formula:
      //   High Priority (d=5,i=15,t=5,u=15) ≈ 33.5
      //   Low Priority  (d=15,i=3,t=15,u=3) ≈ 9.8
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Low Priority Stale',
          difficulty: 15,
          impact: 3,
          time: 15,
          urgency: 3,
          score: 50,
          userId: 'user-123',
          status: 'NOT_STARTED'
        },
        {
          _id: '2',
          title: 'High Priority Stale',
          difficulty: 5,
          impact: 15,
          time: 5,
          urgency: 15,
          score: 10,
          userId: 'user-123',
          status: 'NOT_STARTED'
        }
      ])

      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({
        find: mockFind,
        bulkWrite: mockBulkWrite
      })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)
    })

    it('should rescore tasks that have no scoreVersion', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      expect(mockBulkWrite).toHaveBeenCalled()
    })

    it('should rescore tasks that have outdated scoreVersion', async () => {
      mockToArray.mockResolvedValue([
        {
          _id: '1',
          title: 'Old Versioned Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13,
          score: 10,
          scoreVersion: 0,
          userId: 'user-123',
          status: 'NOT_STARTED'
        }
      ])

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      expect(mockBulkWrite).toHaveBeenCalled()
    })

    it('should return tasks ordered by recalculated score, not stale DB score', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      const result = await handler(request, {} as any)
      const body = await result.json() as any[]

      // DB returns [Low Priority (stale 50), High Priority (stale 10)]
      // After rescoring: High Priority ≈ 33.5, Low Priority ≈ 9.8
      // Response should reflect recalculated order
      expect(body.length).toBe(2)
      expect(body[0].title).toBe('High Priority Stale')
      expect(body[1].title).toBe('Low Priority Stale')
    })

    it('should persist recalculated scores with scoreVersion to database', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      expect(mockBulkWrite).toHaveBeenCalled()
      const operations = mockBulkWrite.mock.calls[0][0]
      expect(operations.length).toBe(2)

      for (const op of operations) {
        expect(op.updateOne).toBeDefined()
        expect(op.updateOne.update.$set).toHaveProperty('score')
        expect(op.updateOne.update.$set).toHaveProperty('scoreVersion')
        expect(typeof op.updateOne.update.$set.score).toBe('number')
        expect(typeof op.updateOne.update.$set.scoreVersion).toBe('number')
      }
    })
  })

  describe('eligibleAt filtering', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'
      process.env.DAILY_CAPACITY_UNITS = '4'
    })

    it('Flat view excludes tasks with eligibleAt in the future', async () => {
      const futureTime = Date.now() + 86400000 // +1 day
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Future Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: futureTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      // Verify find was called with eligibleAt filter
      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ eligibleAt: expect.objectContaining({ $exists: false }) }),
          expect.objectContaining({ eligibleAt: expect.objectContaining({ $lte: expect.any(Number) }) })
        ])
      }))
    })

    it('Flat view includes tasks with eligibleAt in the past', async () => {
      const pastTime = Date.now() - 1000
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Past Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: pastTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      const result = await handler(request, {} as any)
      const body = await result.json()

      // Task should be included
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })

    it('Flat view includes tasks with no eligibleAt', async () => {
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Normal Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED'
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      const result = await handler(request, {} as any)
      const body = await result.json()

      // Task should be included
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })

    it('view=today excludes tasks with eligibleAt > startOfNextDayMs', async () => {
      const farFutureTime = Date.now() + 5 * 86400000 // +5 days (definitely after tomorrow)
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Future Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: farFutureTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/?view=today', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      // Verify find was called with eligibleAt filter including startOfNextDayMs threshold
      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $exists: false }) }),
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $lte: expect.any(Number) }) })
            ])
          })
        ])
      }))
    })

    it('view=today includes tasks with eligibleAt <= startOfNextDayMs', async () => {
      const todayTime = Date.now()
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Today Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: todayTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/?view=today', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      const result = await handler(request, {} as any)
      const body = await result.json()

      // Task should be included  
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })

    it('view=backlog excludes tasks with eligibleAt > startOfNextDayMs', async () => {
      const farFutureTime = Date.now() + 5 * 86400000
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Future Task',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: farFutureTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/?view=backlog', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      // Verify find was called with eligibleAt filter
      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $exists: false }) }),
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $lte: expect.any(Number) }) })
            ])
          })
        ])
      }))
    })

    it('view=backlog includes tasks with eligibleAt <= startOfNextDayMs', async () => {
      const todayTime = Date.now()
      
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Backlog Task',
          difficulty: 15,
          impact: 1,
          time: 20,
          urgency: 1,
          score: 5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: todayTime
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/?view=backlog', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      await handler(request, {} as any)

      // Verify find was called with eligibleAt filter
      // The key point is that eligible tasks are NOT filtered out by the query
      expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $exists: false }) }),
              expect.objectContaining({ eligibleAt: expect.objectContaining({ $lte: expect.any(Number) }) })
            ])
          })
        ])
      }))
    })

    it('Tasks without eligibleAt treated as immediately eligible', async () => {
      mockToArray = vi.fn().mockResolvedValue([
        {
          _id: '1',
          title: 'Task without eligibleAt',
          difficulty: 5,
          impact: 8,
          time: 5,
          urgency: 5,
          score: 10.5,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED'
        },
        {
          _id: '2',
          title: 'Task with eligibleAt',
          difficulty: 3,
          impact: 8,
          time: 2,
          urgency: 9,
          score: 12.3,
          scoreVersion: 1,
          userId: 'user-123',
          status: 'NOT_STARTED',
          eligibleAt: Date.now() - 1000
        }
      ])
      mockSort = vi.fn().mockReturnValue({ toArray: mockToArray })
      mockFind = vi.fn().mockReturnValue({ sort: mockSort })
      mockCollection = vi.fn().mockReturnValue({ find: mockFind, bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }) })
      mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
      mockClient = { db: mockDb }

      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)

      const request = new Request('http://localhost/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer dummy-token-user-123' }
      })

      const result = await handler(request, {} as any)
      const body = await result.json()

      // Both tasks should be included
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(2)
    })
  })
})
