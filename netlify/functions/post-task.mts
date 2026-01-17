import type { Context } from '@netlify/functions'
import { Db, MongoClient } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from '../../consts'
import { TASK_STATUS } from '../../consts-status'
import { isTask } from '../types'
import { calculateScore } from '../utils/scoring'
import { validateToken } from '../utils/auth'

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

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
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

  let taskToInsert
  try {
    taskToInsert = await req.json()
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }
    })
  }

  console.log(taskToInsert)

  if (!isTask(taskToInsert)) {
    console.log('request does not match Task interface')
    return new Response(JSON.stringify({ error: "Invalid task data" }), {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      }
    })
  }

  const taskWithScore = {
    ...taskToInsert,
    score: calculateScore(taskToInsert),
    userId: userId,
    status: TASK_STATUS.NOT_STARTED,
    statusChanged: Date.now()
  }

  try {
    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "")

    if (!cachedDb) {
      const db = client.db(MONGODB_DB_NAME)
      cachedDb = db
    }

    const collection = cachedDb.collection(MONGODB_TASK_COLLECTION_NAME)
    const result = await collection.insertOne(taskWithScore)
    
    return new Response(JSON.stringify({ ...taskWithScore, _id: result.insertedId }), {
        status: 201,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400", // 24 hours
        }
    })
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