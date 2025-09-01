import type { Context } from "@netlify/functions";
import { Db, MongoClient } from "mongodb";
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from "../../consts";

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

    try {
      const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "");
      if (cachedDb === undefined) {
      const db = client.db(MONGODB_DB_NAME); 
        cachedDb = db;
      }

      const collection = cachedDb.collection(MONGODB_TASK_COLLECTION_NAME);
      const tasks = await collection.find({}).toArray();
      console.log(tasks)
      return new Response(JSON.stringify(tasks), {
          headers: {
              'Access-Control-Allow-Origin': '*',
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
              "Access-Control-Max-Age": "86400", // 24 hours
          }
      });
    } catch (error) {
      console.log(error)
      return new Response("Server Error", { status: 500 })
    }
}