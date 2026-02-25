import { describe, it, expect, vi, beforeEach } from 'vitest'

// We'll test the jwt utility functions: signToken and verifyToken
// These use HMAC-SHA256 with a shared secret (JWT_SECRET env var)

describe('JWT Utility', () => {
    let signToken: typeof import('../../netlify/utils/jwt').signToken
    let verifyToken: typeof import('../../netlify/utils/jwt').verifyToken

    beforeEach(async () => {
        vi.resetModules()
        process.env.JWT_SECRET = 'test-secret-key-for-unit-tests-only'
        const mod = await import('../../netlify/utils/jwt')
        signToken = mod.signToken
        verifyToken = mod.verifyToken
    })

    describe('signToken', () => {
        it('should return a string with three dot-separated parts', () => {
            const token = signToken({ sub: 'user-123' })
            const parts = token.split('.')
            expect(parts).toHaveLength(3)
        })

        it('should encode the userId in the payload', () => {
            const token = signToken({ sub: 'user-456' })
            const payloadBase64 = token.split('.')[1]
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())
            expect(payload.sub).toBe('user-456')
        })

        it('should include an expiration claim', () => {
            const token = signToken({ sub: 'user-123' })
            const payloadBase64 = token.split('.')[1]
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())
            expect(payload.exp).toBeDefined()
            expect(typeof payload.exp).toBe('number')
        })

        it('should default to a 14-day expiration', () => {
            const before = Math.floor(Date.now() / 1000)
            const token = signToken({ sub: 'user-123' })
            const after = Math.floor(Date.now() / 1000)

            const payloadBase64 = token.split('.')[1]
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())

            const fourteenDays = 14 * 24 * 60 * 60
            expect(payload.exp).toBeGreaterThanOrEqual(before + fourteenDays)
            expect(payload.exp).toBeLessThanOrEqual(after + fourteenDays)
        })

        it('should accept a custom expiration in seconds', () => {
            const before = Math.floor(Date.now() / 1000)
            const oneHour = 3600
            const token = signToken({ sub: 'user-123' }, oneHour)

            const payloadBase64 = token.split('.')[1]
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())

            expect(payload.exp).toBeGreaterThanOrEqual(before + oneHour)
            expect(payload.exp).toBeLessThanOrEqual(before + oneHour + 2)
        })

        it('should include an issued-at claim', () => {
            const before = Math.floor(Date.now() / 1000)
            const token = signToken({ sub: 'user-123' })
            const after = Math.floor(Date.now() / 1000)

            const payloadBase64 = token.split('.')[1]
            const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())

            expect(payload.iat).toBeGreaterThanOrEqual(before)
            expect(payload.iat).toBeLessThanOrEqual(after)
        })

        it('should throw if JWT_SECRET is not set', () => {
            delete process.env.JWT_SECRET
            expect(() => signToken({ sub: 'user-123' })).toThrow('JWT_SECRET')
        })
    })

    describe('verifyToken', () => {
        it('should return the payload for a valid token', () => {
            const token = signToken({ sub: 'user-789' })
            const payload = verifyToken(token)
            expect(payload.sub).toBe('user-789')
        })

        it('should throw for a token with tampered payload', () => {
            const token = signToken({ sub: 'user-123' })
            const parts = token.split('.')
            // Tamper with the payload
            const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'hacker', exp: 9999999999, iat: 0 })).toString('base64url')
            const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`
            expect(() => verifyToken(tamperedToken)).toThrow('Invalid token signature')
        })

        it('should throw for a token with tampered signature', () => {
            const token = signToken({ sub: 'user-123' })
            const tamperedToken = token.slice(0, -5) + 'XXXXX'
            expect(() => verifyToken(tamperedToken)).toThrow('Invalid token signature')
        })

        it('should throw for an expired token', () => {
            // Sign with -1 second expiration (already expired)
            const token = signToken({ sub: 'user-123' }, -1)
            expect(() => verifyToken(token)).toThrow('Token expired')
        })

        it('should throw for a malformed token', () => {
            expect(() => verifyToken('not-a-valid-token')).toThrow()
        })

        it('should throw for an empty string', () => {
            expect(() => verifyToken('')).toThrow()
        })

        it('should throw if JWT_SECRET is not set', () => {
            const token = signToken({ sub: 'user-123' })
            delete process.env.JWT_SECRET
            expect(() => verifyToken(token)).toThrow('JWT_SECRET')
        })

        it('should reject a token signed with a different secret', () => {
            const token = signToken({ sub: 'user-123' })
            process.env.JWT_SECRET = 'different-secret'
            expect(() => verifyToken(token)).toThrow('Invalid token signature')
        })
    })
})
