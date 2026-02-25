import type { Context } from '@netlify/functions'
import { validateGoogleToken } from '../utils/auth'
import { signToken } from '../utils/jwt'

export default async (req: Request, context: Context) => {
    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        })
    }

    // Only accept POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
    }

    // Validate the Google token (or demo token) and extract userId
    let userId: string
    try {
        userId = await validateGoogleToken(req.headers.get('Authorization') ?? undefined)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed'
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
    }

    // Issue a backend JWT
    const token = signToken({ sub: userId })

    return new Response(JSON.stringify({ token, userId }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    })
}
