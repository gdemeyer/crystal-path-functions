import { Task } from '../types'

/**
 * Increment this value whenever the scoring formula changes.
 * Tasks stored with an older version will be automatically rescored
 * the next time they are fetched.
 */
export const SCORE_VERSION = 3

/**
 * Calculate the priority score for a task.
 * Higher score = higher priority.
 * 
 * Formula weighs:
 * - Lower difficulty (21 - difficulty)
 * - Higher impact (with 1.2x multiplier)
 * - Lower time required (21 - time)
 * - Higher urgency (with 1.2x multiplier)
 *
 * Repeating task clones (tasks with repeatingOriginId set) receive a 5%
 * score reduction so that equivalent non-repeating tasks rank above them.
 */
export function calculateScore(task: Task): number {
  const base = Math.sqrt(
    Math.pow(21 - task.difficulty, 2) +
    Math.pow(task.impact, 2) * 1.2 +
    Math.pow(21 - task.time, 2) +
    Math.pow(task.urgency, 2) * 1.5
  )
  return task.repeatingOriginId ? base * 0.95 : base
}
