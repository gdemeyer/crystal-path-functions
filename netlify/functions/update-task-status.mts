import type { Context } from '@netlify/functions'
import { Db, MongoClient, ObjectId } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from '../../consts'
import { TASK_STATUS, isValidStatus } from '../../consts-status'
import { validateToken } from '../utils/auth'

let cachedDb: Db

export default async (req: Request, context: Context) => {
  console.log(req)
  
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });
  }
  
  // Only accept PATCH requests
  if (req.method !== "PATCH") {
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
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Parse request body
  let requestBody: any
  try {
    requestBody = await req.json()
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  const { taskId, status: newStatus } = requestBody

  // Validate inputs
  if (!taskId || !newStatus) {
    return new Response(JSON.stringify({ error: "Missing taskId or status in request body" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  if (!isValidStatus(newStatus)) {
    return new Response(JSON.stringify({ error: "Invalid status value" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  try {
    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "")

    if (!cachedDb) {
      const db = client.db(MONGODB_DB_NAME)
      cachedDb = db
    }

    const collection = cachedDb.collection(MONGODB_TASK_COLLECTION_NAME)
    
    // Validate taskId format
    let objectId
    try {
      objectId = new ObjectId(taskId)
    } catch (err) {
      return new Response(JSON.stringify({ error: "Invalid task ID format" }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
    
    // Update the task - ensure it belongs to the user
    const result = await collection.findOneAndUpdate(
      { _id: objectId, userId: userId },
      {
        $set: {
          status: newStatus,
          statusChanged: Date.now()
        }
      },
      { returnDocument: 'after' }
    )

    if (!result) {
      console.log(`Task not found: taskId=${taskId}, userId=${userId}`)
      return new Response(JSON.stringify({ error: "Task not found or unauthorized" }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
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
