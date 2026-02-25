import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler from '../../netlify/functions/authenticate.mts'

// Mock Google auth validation
vi.mock('../../netlify/utils/auth', () => ({
    validateGoogleToken: vi.fn(),
}))

// Mock JWT utility
vi.mock('../../netlify/utils/jwt', () => ({
    signToken: vi.fn(() => 'mock-backend-jwt-token'),
}))

import { validateGoogleToken } from '../../netlify/utils/auth'
import { signToken } from '../../netlify/utils/jwt'

describe('POST /authenticate handler', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('CORS', () => {
        it('should handle OPTIONS preflight request', async () => {
            const request = new Request('http://localhost/', { method: 'OPTIONS' })
            const result = await handler(request, {} as any)
            expect(result.status).toBe(204)
            expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
            expect(result.headers.get('Access-Control-Allow-Methods')).toContain('POST')
            expect(result.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
        })
    })

    describe('Method validation', () => {
        it('should reject non-POST requests', async () => {
            const request = new Request('http://localhost/', { method: 'GET' })
            const result = await handler(request, {} as any)
            expect(result.status).toBe(405)
        })

        it('should reject PUT requests', async () => {
            const request = new Request('http://localhost/', { method: 'PUT' })
            const result = await handler(request, {} as any)
            expect(result.status).toBe(405)
        })
    })

    describe('Authentication flow', () => {
        it('should accept a valid Google token and return a backend JWT', async () => {
            ;(validateGoogleToken as any).mockResolvedValue('google-user-sub-123')

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer valid-google-token',
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.status).toBe(200)

            const body = await result.json()
            expect(body.token).toBe('mock-backend-jwt-token')
            expect(body.userId).toBe('google-user-sub-123')
        })

        it('should call validateGoogleToken with the Authorization header', async () => {
            ;(validateGoogleToken as any).mockResolvedValue('user-abc')

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer my-google-token',
                    'Content-Type': 'application/json',
                },
            })

            await handler(request, {} as any)

            expect(validateGoogleToken).toHaveBeenCalledWith('Bearer my-google-token')
        })

        it('should call signToken with the extracted userId', async () => {
            ;(validateGoogleToken as any).mockResolvedValue('user-xyz')

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer google-token',
                    'Content-Type': 'application/json',
                },
            })

            await handler(request, {} as any)

            expect(signToken).toHaveBeenCalledWith({ sub: 'user-xyz' })
        })

        it('should return 401 when Google token is invalid', async () => {
            ;(validateGoogleToken as any).mockRejectedValue(new Error('Token verification failed'))

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer invalid-google-token',
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.status).toBe(401)

            const body = await result.json()
            expect(body.error).toBeDefined()
        })

        it('should return 401 when Authorization header is missing', async () => {
            ;(validateGoogleToken as any).mockRejectedValue(new Error('Missing Authorization header'))

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.status).toBe(401)
        })

        it('should include CORS headers in success response', async () => {
            ;(validateGoogleToken as any).mockResolvedValue('user-123')

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer valid-token',
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
            expect(result.headers.get('Content-Type')).toBe('application/json')
        })

        it('should include CORS headers in error response', async () => {
            ;(validateGoogleToken as any).mockRejectedValue(new Error('Invalid'))

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer bad-token',
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.headers.get('Access-Control-Allow-Origin')).toBe('*')
        })
    })

    describe('Demo mode', () => {
        it('should accept a demo token and return a backend JWT', async () => {
            ;(validateGoogleToken as any).mockResolvedValue('demo-user-123')

            const request = new Request('http://localhost/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer dummy-token-demo-user-123',
                    'Content-Type': 'application/json',
                },
            })

            const result = await handler(request, {} as any)
            expect(result.status).toBe(200)

            const body = await result.json()
            expect(body.token).toBeDefined()
            expect(body.userId).toBe('demo-user-123')
        })
    })
})
