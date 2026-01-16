import { Task } from '../types'

/**
 * Calculate the priority score for a task.
 * Higher score = higher priority.
 * 
 * Formula weighs:
 * - Lower difficulty (21 - difficulty)
 * - Higher impact (with 1.2x multiplier)
 * - Lower time required (21 - time)
 * - Higher urgency (with 1.2x multiplier)
 */
export function calculateScore(task: Task): number {
  return Math.sqrt(
    Math.pow(21 - task.difficulty, 2) +
    Math.pow(task.impact, 2) * 1.2 +
    Math.pow(21 - task.time, 2) +
    Math.pow(task.urgency, 2) * 1.2
  )
}
