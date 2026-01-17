let googleClient: any;

// Lazy initialization to handle test mocking
async function getGoogleClient() {
    if (!googleClient && process.env.DEMO_MODE !== 'true') {
        const { OAuth2Client } = await import('google-auth-library');
        googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }
    return googleClient;
}

interface TokenPayload {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    aud?: string;
}

/**
 * Validates a Google OAuth token and extracts the user ID (sub claim)
 * 
 * Supports two modes:
 * 1. Real tokens: Verified using Google's public keys
 * 2. Demo tokens: Simple format "dummy-token-{userId}" when DEMO_MODE=true
 * 
 * @param authorizationHeader - The Authorization header value (e.g., "Bearer token...")
 * @returns User ID (sub claim) from token, or null if invalid
 * @throws Error if token is invalid or verification fails
 */
export async function validateToken(authorizationHeader?: string): Promise<string> {
    if (!authorizationHeader) {
        throw new Error('Missing Authorization header');
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/);
    if (!match) {
        throw new Error('Invalid Authorization header format');
    }

    const token = match[1];

    // Demo mode: Accept dummy tokens
    if (process.env.DEMO_MODE === 'true') {
        if (token.startsWith('dummy-token-')) {
            const userId = token.replace('dummy-token-', '');
            if (userId) {
                return userId;
            }
        }
        throw new Error('Invalid demo token format');
    }

    // Real Google token verification
    if (!process.env.GOOGLE_CLIENT_ID) {
        throw new Error('GOOGLE_CLIENT_ID not configured');
    }

    try {
        const client = await getGoogleClient();
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload() as TokenPayload;
        
        if (!payload.sub) {
            throw new Error('Token missing user ID (sub claim)');
        }

        // Optionally verify email is verified
        if (!payload.email_verified) {
            console.warn('Warning: Google account email not verified');
        }

        return payload.sub;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
        throw new Error('Token verification failed: Unknown error');
    }
}

/**
 * Extracts user ID from Authorization header without full verification
 * Used for test mocking where we control token format
 * 
 * @param authorizationHeader - The Authorization header value
 * @returns User ID or null if header is invalid
 */
export function extractUserIdFromToken(authorizationHeader?: string): string | null {
    if (!authorizationHeader) {
        return null;
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/);
    if (!match) {
        return null;
    }

    const token = match[1];

    // Demo token format
    if (token.startsWith('dummy-token-')) {
        const userId = token.replace('dummy-token-', '');
        return userId || null;
    }

    // For real tokens, we can't extract without verification
    // Return null and let validateToken handle it
    return null;
}
