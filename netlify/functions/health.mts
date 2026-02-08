import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    console.log(req)
    
    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });
    }
    
    return new Response(JSON.stringify({message: "hello"}), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        }
    });
}