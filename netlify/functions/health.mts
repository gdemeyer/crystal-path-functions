import type { Context } from "@netlify/functions";

export default async (req: Request, context: Context) => {
    console.log(req)
    
    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
    }
    
    return new Response(JSON.stringify({message: "hello"}), {
        headers: {
            'Content-Type': 'application/json',
        }
    });
}