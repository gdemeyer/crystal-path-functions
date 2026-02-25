import { createHmac } from 'crypto'

const FOURTEEN_DAYS_SECONDS = 14 * 24 * 60 * 60

interface JwtPayload {
    sub: string
    iat?: number
    exp?: number
    [key: string]: unknown
}

function getSecret(): string {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET environment variable is not set')
    }
    return secret
}

function base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url')
}

function createSignature(headerB64: string, payloadB64: string, secret: string): string {
    return createHmac('sha256', secret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url')
}

/**
 * Signs a JWT with HMAC-SHA256 using JWT_SECRET.
 * 
 * @param payload - Must include `sub` (user ID). `iat` and `exp` are added automatically.
 * @param expiresInSeconds - Token lifetime in seconds (default: 14 days)
 * @returns Signed JWT string
 */
export function signToken(payload: { sub: string }, expiresInSeconds: number = FOURTEEN_DAYS_SECONDS): string {
    const secret = getSecret()

    const now = Math.floor(Date.now() / 1000)

    const header = { alg: 'HS256', typ: 'JWT' }
    const fullPayload: JwtPayload = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds,
    }

    const headerB64 = base64UrlEncode(JSON.stringify(header))
    const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload))
    const signature = createSignature(headerB64, payloadB64, secret)

    return `${headerB64}.${payloadB64}.${signature}`
}

/**
 * Verifies a JWT signed with HMAC-SHA256 and returns the payload.
 * 
 * @param token - The JWT string to verify
 * @returns The decoded payload
 * @throws Error if token is invalid, tampered, or expired
 */
export function verifyToken(token: string): JwtPayload {
    const secret = getSecret()

    const parts = token.split('.')
    if (parts.length !== 3) {
        throw new Error('Invalid token format')
    }

    const [headerB64, payloadB64, signature] = parts

    // Verify signature
    const expectedSignature = createSignature(headerB64, payloadB64, secret)
    if (signature !== expectedSignature) {
        throw new Error('Invalid token signature')
    }

    // Decode payload
    const payload: JwtPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp !== undefined && payload.exp < now) {
        throw new Error('Token expired')
    }

    return payload
}
