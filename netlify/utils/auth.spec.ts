import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateToken, extractUserIdFromToken } from './auth';

// Mock google-auth-library
vi.mock('google-auth-library', () => {
    return {
        OAuth2Client: vi.fn().mockImplementation(() => ({
            verifyIdToken: vi.fn(),
        })),
    };
});

describe('Token Validation Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        delete process.env.DEMO_MODE;
        delete process.env.GOOGLE_CLIENT_ID;
    });

    describe('validateToken - Demo Mode', () => {
        beforeEach(() => {
            process.env.DEMO_MODE = 'true';
        });

        it('should accept demo token with valid format', async () => {
            const token = 'Bearer dummy-token-user-123';
            const userId = await validateToken(token);
            expect(userId).toBe('user-123');
        });

        it('should reject demo token with invalid format', async () => {
            const token = 'Bearer invalid-token';
            await expect(validateToken(token)).rejects.toThrow('Invalid demo token format');
        });

        it('should reject missing Authorization header', async () => {
            await expect(validateToken(undefined)).rejects.toThrow('Missing Authorization header');
        });

        it('should reject malformed Authorization header', async () => {
            const token = 'InvalidToken';
            await expect(validateToken(token)).rejects.toThrow('Invalid Authorization header format');
        });

        it('should reject Bearer token without token value', async () => {
            const token = 'Bearer ';
            await expect(validateToken(token)).rejects.toThrow('Invalid Authorization header format');
        });
    });

    describe('validateToken - Real Google Tokens', () => {
        beforeEach(() => {
            process.env.DEMO_MODE = 'false';
            process.env.GOOGLE_CLIENT_ID = 'test-client-id';
        });

        it('should reject when GOOGLE_CLIENT_ID not configured', async () => {
            delete process.env.GOOGLE_CLIENT_ID;
            process.env.DEMO_MODE = 'false';
            const token = 'Bearer real-google-token';
            await expect(validateToken(token)).rejects.toThrow('GOOGLE_CLIENT_ID not configured');
        });

        it('should reject missing Authorization header', async () => {
            await expect(validateToken(undefined)).rejects.toThrow('Missing Authorization header');
        });

        it('should reject malformed Authorization header', async () => {
            const token = 'InvalidToken';
            await expect(validateToken(token)).rejects.toThrow('Invalid Authorization header format');
        });
    });

    describe('extractUserIdFromToken - Demo Mode', () => {
        it('should extract userId from demo token', () => {
            const token = 'Bearer dummy-token-user-456';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBe('user-456');
        });

        it('should return null for invalid demo token', () => {
            const token = 'Bearer invalid-token';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBeNull();
        });

        it('should return null for missing Authorization header', () => {
            const userId = extractUserIdFromToken(undefined);
            expect(userId).toBeNull();
        });

        it('should return null for malformed Authorization header', () => {
            const token = 'InvalidToken';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBeNull();
        });

        it('should return null for real token format', () => {
            const token = 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ...';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBeNull();
        });
    });

    describe('extractUserIdFromToken - Token Format Variations', () => {
        it('should handle demo token with numeric userId', () => {
            const token = 'Bearer dummy-token-12345';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBe('12345');
        });

        it('should handle demo token with alphanumeric userId', () => {
            const token = 'Bearer dummy-token-user-abc-123';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBe('user-abc-123');
        });

        it('should handle demo token with UUID-like userId', () => {
            const token = 'Bearer dummy-token-550e8400-e29b-41d4-a716-446655440000';
            const userId = extractUserIdFromToken(token);
            expect(userId).toBe('550e8400-e29b-41d4-a716-446655440000');
        });
    });
});
