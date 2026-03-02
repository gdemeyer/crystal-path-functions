import type { Context } from "@netlify/functions";
import { Collection, MongoClient } from "mongodb";
import { MONGODB_DB_NAME, MONGODB_TASK_COLLECTION_NAME } from "../../consts";
import { TASK_STATUS } from "../../consts-status";
import { validateToken } from "../utils/auth";
import partitionTasksForDate from "../utils/scheduler";
import { Task } from "../types";
import { addDays, isValidTimezone, startOfDayUtcMs, utcMsToLocalDate } from "../utils/timezone";
import { calculateScore, SCORE_VERSION } from "../utils/scoring";

/**
 * For any tasks whose scoreVersion doesn't match the current SCORE_VERSION,
 * recalculate scores and persist them via bulkWrite. The tasks array is
 * mutated in place so the caller can re-sort and return fresher data without
 * an additional DB round-trip.
 */
async function rescoreStaleTasksInPlace(tasks: Task[], collection: Collection): Promise<number> {
  const stale = tasks.filter(t => t.scoreVersion !== SCORE_VERSION);
  if (stale.length === 0) return 0;

  const bulkOps = stale.map(t => ({
    updateOne: {
      filter: { _id: t._id },
      update: {
        $set: {
          score: calculateScore(t),
          scoreVersion: SCORE_VERSION
        }
      }
    }
  }));

  collection.bulkWrite(bulkOps);

  for (const t of stale) {
    t.score = calculateScore(t);
    t.scoreVersion = SCORE_VERSION;
  }

  return stale.length;
}

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
      const db = client.db(MONGODB_DB_NAME);
      const collection = db.collection(MONGODB_TASK_COLLECTION_NAME);
      
      // Parse query parameters
      const url = new URL(req.url);
      const view = url.searchParams.get('view');
      const dateParam = url.searchParams.get('date');
      const timezoneParam = url.searchParams.get('timezone');

      // Validate timezone parameter
      if (timezoneParam !== null && !isValidTimezone(timezoneParam)) {
        return new Response(JSON.stringify({ error: "Invalid timezone parameter" }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
      
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

        const rescored = await rescoreStaleTasksInPlace(tasks, collection);
        if (rescored > 0) {
          tasks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        }

        // Strip internal fields from response
        payload = tasks.map(({ score, scoreVersion, ...rest }) => rest) as Task[];
      } else {
        // view=today or view=backlog: use scheduler
        // Determine "today" using the client's timezone when available
        const date = dateParam ?? (
          timezoneParam
            ? utcMsToLocalDate(Date.now(), timezoneParam)
            : new Date().toISOString().slice(0, 10)
        );
        const dailyCapacityUnits = Number(process.env.DAILY_CAPACITY_UNITS ?? 4);

        // Compute day boundaries — timezone-aware when the client sends one
        const startOfDayMs = timezoneParam
          ? startOfDayUtcMs(date, timezoneParam)
          : new Date(date + 'T00:00:00.000Z').getTime();

        const nextDayStr = addDays(date, 1);
        const startOfNextDayMs = timezoneParam
          ? startOfDayUtcMs(nextDayStr, timezoneParam)
          : new Date(nextDayStr + 'T00:00:00.000Z').getTime();

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

        await rescoreStaleTasksInPlace(tasks, collection);

        const { today, backlog } = partitionTasksForDate(tasks, date, dailyCapacityUnits, timezoneParam ?? undefined);
        
        // Strip internal fields from response
        const stripInternal = (t: Task[]) => t.map(({ score, scoreVersion, ...rest }) => rest) as Task[];
        payload = view === 'today' ? stripInternal(today) : stripInternal(backlog);
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