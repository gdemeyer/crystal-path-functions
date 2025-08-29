import type { Context } from "@netlify/functions";
import { Db, MongoClient } from "mongodb";

let cachedDb: Db

export default async (req: Request, context: Context) => {
    console.log(req)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Access-Control-Allow-Origin",
            "Access-Control-Max-Age": "86400", // 24 hours
            },
        });
    }

    if (cachedDb) {
      return cachedDb;
    }

    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "");

    const db = client.db('CrystalPath'); // Replace with your database name
    cachedDb = db;
    const collection = db.collection('Tasks');
    const tasks = await collection.find({}).toArray();
    
    return new Response(JSON.stringify(tasks), {
        headers: {
            'Access-Control-Allow-Origin': '*',
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400", // 24 hours
        }
    });
}