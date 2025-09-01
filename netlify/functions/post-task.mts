import type { Context } from '@netlify/functions'
import { Db, MongoClient } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from '../../consts'
import { isTask } from '../types'

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

  const taskToInsert = await req.json()

  console.log(taskToInsert)

  if (!isTask(taskToInsert)) {
    console.log('request does not match Task interface')
    return new Response("Server Error")
  }

  try {
    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "")

    if (!cachedDb) {
      const db = client.db(MONGODB_DB_NAME)
      cachedDb = db
    }

    const collection = cachedDb.collection(MONGODB_TASK_COLLECTION_NAME)
    const taskInserted = await collection.insertOne(taskToInsert)
    
    return new Response(JSON.stringify(taskInserted), {
        headers: {
            'Access-Control-Allow-Origin': '*',
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400", // 24 hours
        }
    })
  } catch (error) {
    console.log(error)
    return new Response("Server Error", { status: 500 })
  }
}