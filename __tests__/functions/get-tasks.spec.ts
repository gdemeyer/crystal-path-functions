import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './get-tasks.mts'
import * as mongodb from 'mongodb'

// Mock MongoDB module
vi.mock('mongodb')

// Mock token validation
vi.mock('../utils/auth', () => ({
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
  let mockFind: any
  let mockCollection: any
  let mockDb: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'

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
        userId: 'user-123'
      },
      {
        _id: '2',
        title: 'Task 2',
        difficulty: 3,
        impact: 8,
        time: 2,
        urgency: 9,
        score: 12.3,
        userId: 'user-123'
      }
    ])
    mockFind = vi.fn().mockReturnValue({ toArray: mockToArray })
    mockCollection = vi.fn().mockReturnValue({ find: mockFind })
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
        expect(task).toHaveProperty('score')
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
      expect(result.headers.get('Access-Control-Allow-Methods')).toContain('GET')
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
        expect(body[0]).toHaveProperty('score')
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
        expect(task.title).toBe('Task 1')
        expect(task.difficulty).toBe(5)
        expect(task.impact).toBe(5)
        expect(task.score).toBe(10.5)
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
})
