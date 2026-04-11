import type { Context } from '@netlify/functions'
import { MongoClient, ObjectId } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from '../../consts'
import { isTask } from '../types'
import { calculateScore, SCORE_VERSION } from '../utils/scoring'
import { validateToken } from '../utils/auth'

export default async (req: Request, context: Context) => {
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // Only accept PUT requests
  if (req.method !== "PUT") {
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
  let requestBody: Record<string, unknown>
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

  const { taskId, ...taskData } = requestBody

  // Validate taskId
  if (!taskId) {
    return new Response(JSON.stringify({ error: "Missing taskId in request body" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Validate task data
  if (!isTask(taskData)) {
    return new Response(JSON.stringify({ error: "Invalid task data" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Validate title is not empty
  if (!taskData.title || taskData.title.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Task title cannot be empty" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Validate taskId format
  let objectId: ObjectId
  try {
    objectId = new ObjectId(taskId as string)
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid task ID format" }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })
  }

  // Build $set with whitelisted fields only
  const fieldsToSet: Record<string, unknown> = {
    title: taskData.title,
    difficulty: taskData.difficulty,
    impact: taskData.impact,
    time: taskData.time,
    urgency: taskData.urgency,
    score: calculateScore(taskData),
    scoreVersion: SCORE_VERSION,
  }

  const updateOperation: Record<string, unknown> = { $set: fieldsToSet }

  if (taskData.repeatOnComplete === true) {
    fieldsToSet.repeatOnComplete = true
  } else {
    updateOperation.$unset = { repeatOnComplete: '' }
  }

  try {
    const client = await MongoClient.connect(process.env.MONGODB_CONNECTION_STRING ?? "")
    const db = client.db(MONGODB_DB_NAME)
    const collection = db.collection(MONGODB_TASK_COLLECTION_NAME)

    const updatedDoc = await collection.findOneAndUpdate(
      { _id: objectId, userId: userId },
      updateOperation,
      { returnDocument: 'after' }
    )

    if (!updatedDoc) {
      return new Response(JSON.stringify({ error: "Task not found or unauthorized" }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }

    // Strip score and scoreVersion from response
    const { score, scoreVersion, ...responseTask } = updatedDoc as Record<string, unknown>
    return new Response(JSON.stringify(responseTask), {
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
