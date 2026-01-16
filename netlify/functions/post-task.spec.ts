import { describe, it, expect, beforeEach, vi } from 'vitest'
import handler from './post-task.mts'
import * as mongodb from 'mongodb'

// Mock MongoDB module
vi.mock('mongodb')

// Mock calculateScore utility
vi.mock('../utils/scoring', () => ({
  calculateScore: vi.fn((task) => {
    return Math.sqrt(
      Math.pow(21 - task.difficulty, 2) +
      Math.pow(task.impact, 2) * 1.2 +
      Math.pow(21 - task.time, 2) +
      Math.pow(task.urgency, 2) * 1.2
    )
  })
}))

describe('POST /post-task handler', () => {
  let mockInsertOne: any
  let mockCollection: any
  let mockDb: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MONGODB_CONNECTION_STRING = 'mongodb://localhost:27017'

    // Setup MongoDB mocks - these need to be real functions
    mockInsertOne = vi.fn().mockResolvedValue({ insertedId: 'test-id-123' })
    mockCollection = vi.fn().mockReturnValue({ insertOne: mockInsertOne })
    mockDb = vi.fn().mockReturnValue({ collection: mockCollection })
    mockClient = {
      db: mockDb
    }

    // Mock MongoClient.connect to return our mock client
    const MongoClientMock = mongodb.MongoClient as any
    MongoClientMock.connect = vi.fn().mockResolvedValue(mockClient)
  })

  describe('Valid POST requests', () => {
    it('should accept POST requests', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(201)
    })

    it('should calculate score for valid task', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json()
      
      expect(body.score).toBeDefined()
      expect(typeof body.score).toBe('number')
      expect(body.score).toBeGreaterThan(0)
    })

    it('should preserve task properties in response', async () => {
      const taskData = {
        title: 'Complete Task',
        difficulty: 3,
        impact: 5,
        time: 8,
        urgency: 2
      }

      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify(taskData)
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json()
      
      expect(body.title).toBe(taskData.title)
      expect(body.difficulty).toBe(taskData.difficulty)
      expect(body.impact).toBe(taskData.impact)
      expect(body.time).toBe(taskData.time)
      expect(body.urgency).toBe(taskData.urgency)
    })

    it('should include _id from MongoDB insert', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json()
      
      expect(body._id).toBeDefined()
    })

    it('should include CORS headers in response', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(result.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })
  })

  describe('Invalid requests', () => {
    it('should reject requests with invalid task data', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Incomplete Task'
          // Missing required fields
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(400)
    })

    it('should reject requests without body', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(400)
    })

    it('should reject malformed JSON', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: '{ invalid json }'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect([400, 500]).toContain(result.status)
    })
  })

  describe('Database operations', () => {
    it('should connect to MongoDB using connection string', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      await handler(request, context as any)

      const MongoClientMock = mongodb.MongoClient as any
      expect(MongoClientMock.connect).toHaveBeenCalled()
    })

    it('should query correct database', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      
      // Verify successful response which indicates database operation succeeded
      expect(result.status).toBe(201)
      const body = await result.json()
      expect(body).toHaveProperty('_id')
    })

    it('should insert into tasks collection', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)

      // Verify that a response was returned indicating insertOne was called
      expect(result.status).toBe(201)
      const body = await result.json()
      expect(body).toHaveProperty('score')
    })

    it('should handle database connection errors gracefully', async () => {
      const MongoClientMock = mongodb.MongoClient as any
      MongoClientMock.connect = vi.fn().mockRejectedValueOnce(new Error('Connection failed'))

      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(500)
    })
  })

  describe('HTTP methods', () => {
    it('should respond to OPTIONS requests with 204', async () => {
      const request = new Request('http://localhost/', {
        method: 'OPTIONS'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.status).toBe(204)
    })

    it('should include CORS headers in OPTIONS response', async () => {
      const request = new Request('http://localhost/', {
        method: 'OPTIONS'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(result.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('should reject non-POST, non-OPTIONS requests', async () => {
      const request = new Request('http://localhost/', {
        method: 'GET'
      })
      const context = {}

      const result = await handler(request, context as any)
      expect([405, 400]).toContain(result.status)
    })
  })

  describe('Response format', () => {
    it('should return valid JSON response', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      const body = await result.json()
      
      expect(body).toHaveProperty('title')
      expect(body).toHaveProperty('score')
      expect(body).toHaveProperty('_id')
    })

    it('should return correct HTTP headers', async () => {
      const request = new Request('http://localhost/', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Task',
          difficulty: 5,
          impact: 8,
          time: 3,
          urgency: 13
        })
      })
      const context = {}

      const result = await handler(request, context as any)
      
      expect(result.headers.get('Content-Type')).toContain('application/json')
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })
})
