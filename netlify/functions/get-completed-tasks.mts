import type { Context } from "@netlify/functions";
import { Db, MongoClient } from "mongodb";
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from "../../consts";
import { TASK_STATUS } from "../../consts-status";
import { validateToken } from "../utils/auth";

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
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Only accept GET requests
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Validate authentication
  let userId: string
  try {
    userId = await validateToken(req.headers.get('Authorization') ?? undefined)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unauthorized"
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }
    })
  }

  try {
    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "");
    if (cachedDb === undefined) {
      const db = client.db(MONGODB_DB_NAME); 
      cachedDb = db;
    }

    const collection = cachedDb.collection(MONGODB_TASK_COLLECTION_NAME);
    // Return only completed tasks for the user, sorted by most recent first
    const tasks = await collection.find({ 
      userId: userId,
      status: TASK_STATUS.COMPLETED
    }).sort({ statusChanged: -1 }).toArray();
    
    console.log(tasks)
    return new Response(JSON.stringify(tasks), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      }
    });
  } catch (error) {
    console.log(error)
    return new Response(JSON.stringify({ error: "Server error" }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }
}
