import type { Context } from "@netlify/functions";
import { Db, MongoClient } from "mongodb";
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from "../../consts";
import { TASK_STATUS } from "../../consts-status";
import { validateToken } from "../utils/auth";
import partitionTasksForDate from "../utils/scheduler";
import { Task } from "../types";

let cachedDb: Db

export default async (req: Request, context: Context) => {
    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
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
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
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
      
      // Parse query parameters
      const url = new URL(req.url);
      const view = url.searchParams.get('view');
      const dateParam = url.searchParams.get('date');
      
      // Validate view parameter
      if (view !== null && view !== 'today' && view !== 'backlog') {
        return new Response(JSON.stringify({ error: "Invalid view parameter. Must be 'today' or 'backlog'" }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }

      let payload: Task[];

      if (view === null) {
        // No view param: return flat array of uncompleted tasks (backward-compatible)
        const tasks = await collection.find({ 
          userId: userId,
          status: { $ne: TASK_STATUS.COMPLETED }
        }).sort({ score: -1 }).toArray() as Task[];
        
        // Strip score from response - score is internal only
        payload = tasks.map(({ score, ...rest }) => rest) as Task[];
      } else {
        // view=today or view=backlog: use scheduler
        const date = dateParam ?? new Date().toISOString().slice(0, 10);
        const dailyCapacityUnits = Number(process.env.DAILY_CAPACITY_UNITS ?? 4);

        // Helper to get start of day timestamp in ms
        const getStartOfDay = (dateStr: string): number => {
          const d = new Date(dateStr + 'T00:00:00.000Z');
          return d.getTime();
        };

        const startOfDayMs = getStartOfDay(date);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const startOfNextDayMs = getStartOfDay(nextDay.toISOString().slice(0, 10));

        // Optimized MongoDB query: active tasks + completed-today tasks
        const tasks = await collection.find({
          userId: userId,
          $or: [
            { status: { $ne: TASK_STATUS.COMPLETED } },
            {
              status: TASK_STATUS.COMPLETED,
              statusChanged: {
                $gte: startOfDayMs,
                $lt: startOfNextDayMs
              }
            }
          ]
        }).sort({ score: -1 }).toArray() as Task[];

        const { today, backlog } = partitionTasksForDate(tasks, date, dailyCapacityUnits);
        
        // Strip score from response - score is internal only
        const stripScore = (t: Task[]) => t.map(({ score, ...rest }) => rest) as Task[];
        payload = view === 'today' ? stripScore(today) : stripScore(backlog);
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Server error" }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
}