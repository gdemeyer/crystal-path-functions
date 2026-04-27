import * as scoring from './scoring'
import { calculateScore } from './scoring'
import { Task } from '../types'

describe('SCORE_VERSION', () => {
  it('should be exported as a positive integer', () => {
    expect(scoring).toHaveProperty('SCORE_VERSION')
    expect(typeof (scoring as any).SCORE_VERSION).toBe('number')
    expect(Number.isInteger((scoring as any).SCORE_VERSION)).toBe(true)
    expect((scoring as any).SCORE_VERSION).toBeGreaterThan(0)
  })
})

describe('scoring utility', () => {
  it('calculates score correctly', () => {
    const task: Task = {
      title: 'Test Task',
      difficulty: 5,
      impact: 8,
      time: 3,
      urgency: 13
    }

    const score = calculateScore(task)

    // Verify it's a positive number
    expect(score).toBeGreaterThan(0)
    expect(typeof score).toBe('number')

    // Verify it matches the formula
    const expected = Math.sqrt(
      Math.pow(21 - 5, 2) +
      Math.pow(8, 2) * 1.2 +
      Math.pow(21 - 3, 2) +
      Math.pow(13, 2) * 1.5
    )
    expect(score).toBeCloseTo(expected, 5)
  })

  it('gives higher priority to high-impact, high-urgency tasks', () => {
    const lowPriority: Task = {
      title: 'Low Priority',
      difficulty: 1,
      impact: 1,
      time: 20,
      urgency: 1
    }

    const highPriority: Task = {
      title: 'High Priority',
      difficulty: 20,
      impact: 13,
      time: 1,
      urgency: 13
    }

    const lowScore = calculateScore(lowPriority)
    const highScore = calculateScore(highPriority)

    expect(highScore).toBeGreaterThan(lowScore)
  })

  it('prefers less time investment over difficulty', () => {
    const quickTask: Task = {
      title: 'Quick',
      difficulty: 10,
      impact: 5,
      time: 1,
      urgency: 5
    }

    const slowTask: Task = {
      title: 'Slow',
      difficulty: 5,
      impact: 5,
      time: 20,
      urgency: 5
    }

    const quickScore = calculateScore(quickTask)
    const slowScore = calculateScore(slowTask)

    expect(quickScore).toBeGreaterThan(slowScore)
  })

  it('applies 5% score penalty when repeatingOriginId is set', () => {
    const task: Task = {
      title: 'Task',
      difficulty: 5,
      impact: 8,
      time: 3,
      urgency: 13,
    }
    const baseScore = calculateScore(task)
    const cloneScore = calculateScore({ ...task, repeatingOriginId: 'origin-123' })

    expect(cloneScore).toBeCloseTo(baseScore * 0.95, 5)
    expect(cloneScore).toBeLessThan(baseScore)
  })

  it('does not penalise tasks without repeatingOriginId', () => {
    const task: Task = {
      title: 'Task',
      difficulty: 5,
      impact: 8,
      time: 3,
      urgency: 13,
    }
    const expected = Math.sqrt(
      Math.pow(21 - 5, 2) +
      Math.pow(8, 2) * 1.2 +
      Math.pow(21 - 3, 2) +
      Math.pow(13, 2) * 1.5
    )
    expect(calculateScore(task)).toBeCloseTo(expected, 5)
  })
})
