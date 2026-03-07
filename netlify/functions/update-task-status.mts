import type { Context } from '@netlify/functions'
import { Db, MongoClient, ObjectId } from 'mongodb'
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from '../../consts'
import { TASK_STATUS, isValidStatus } from '../../consts-status'
import { validateToken } from '../utils/auth'
import { buildCloneDocument } from '../utils/repeat'

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
    // Use 'before' to get the pre-update document so we can check previous status
    const beforeDoc = await collection.findOneAndUpdate(
      { _id: objectId, userId: userId },
      {
        $set: {
          status: newStatus,
          statusChanged: Date.now()
        }
      },
      { returnDocument: 'before' }
    )

    if (!beforeDoc) {
      console.log(`Task not found: taskId=${taskId}, userId=${userId}`)
      return new Response(JSON.stringify({ error: "Task not found or unauthorized" }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }

    // Construct the updated task to return to client
    const statusChangedTimestamp = Date.now()
    const updatedTask = {
      ...beforeDoc,
      status: newStatus,
      statusChanged: statusChangedTimestamp
    }

    // Clone-on-completion logic
    // Only create a clone if:
    // 1. The task has repeatOnComplete set to true
    // 2. The new status is COMPLETED
    // 3. The previous status was NOT already COMPLETED (prevent duplicate clones)
    const shouldClone = 
      beforeDoc.repeatOnComplete === true &&
      newStatus === TASK_STATUS.COMPLETED &&
      beforeDoc.status !== TASK_STATUS.COMPLETED

    if (shouldClone) {
      try {
        const cloneDoc = buildCloneDocument(beforeDoc, Date.now())
        await collection.insertOne(cloneDoc)
      } catch (cloneError) {
        console.error('Failed to insert clone, attempting rollback', cloneError)
        
        // Attempt to rollback the original task's status
        try {
          await collection.findOneAndUpdate(
            { _id: objectId, userId: userId },
            {
              $set: {
                status: beforeDoc.status,
                statusChanged: beforeDoc.statusChanged
              }
            }
          )
        } catch (rollbackError) {
          console.error('Rollback also failed', rollbackError)
        }

        return new Response(JSON.stringify({ error: "Failed to create recurring task clone" }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
    }

    return new Response(JSON.stringify(updatedTask), {
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
