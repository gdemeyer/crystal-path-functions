import { Task } from '../types'
import { TASK_STATUS } from '../../consts-status'
import { calculateScore, SCORE_VERSION } from './scoring'

/**
 * Urgency value to delay days mapping.
 * Based on Fibonacci values from the urgency slider.
 * Delays match the cadence implied by each urgency label.
 * Unknown values default to 14 days.
 */
const URGENCY_TO_DELAY_DAYS: Record<number, number> = {
  1: 90,   // Eventually  (~quarterly)
  2: 30,   // This Month  (~monthly)
  3: 7,    // This Week   (~weekly)
  5: 2,    // Tomorrow    (~bi-daily)
  8: 1,    // Today       (~daily)
  13: 1,   // Immediately (~daily)
}

/**
 * Get the number of days to delay before a cloned task becomes eligible.
 * @param urgency - The urgency value from the original task
 * @returns Number of days to delay (1-14)
 */
export function getDelayDaysForUrgency(urgency: number): number {
  return URGENCY_TO_DELAY_DAYS[urgency] ?? 14
}

/**
 * Build a clone document for a repeating task.
 * The clone is ready to be inserted into the database.
 * 
 * @param originalTask - The task being completed
 * @param nowMs - Current timestamp in milliseconds
 * @returns A new task document (clone) ready for insertion
 */
export function buildCloneDocument(originalTask: Task, nowMs: number): any {
  const delayDays = getDelayDaysForUrgency(originalTask.urgency)
  const eligibleAt = nowMs + delayDays * 86400000

  // Score the clone with repeatingOriginId set so the 5% penalty is applied
  const cloneForScoring: Task = {
    ...originalTask,
    repeatingOriginId: originalTask._id,
  }

  const clone: any = {
    title: originalTask.title,
    difficulty: originalTask.difficulty,
    impact: originalTask.impact,
    time: originalTask.time,
    urgency: originalTask.urgency,
    userId: originalTask.userId,
    status: TASK_STATUS.NOT_STARTED,
    repeatingOriginId: originalTask._id,
    eligibleAt: eligibleAt,
    score: calculateScore(cloneForScoring),
    scoreVersion: SCORE_VERSION,
  }

  // Copy repeatOnComplete if present
  if (originalTask.repeatOnComplete === true) {
    clone.repeatOnComplete = true
  }

  return clone
}
