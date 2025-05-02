import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400", // 24 hours
            },
        });
    }

    return new Response("hello", {
        headers: {
            'Access-Control-Allow-Origin': '*',
        }
    });
}