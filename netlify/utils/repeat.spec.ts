import { getDelayDaysForUrgency, buildCloneDocument } from './repeat'
import { Task } from '../types'
import { TASK_STATUS } from '../../consts-status'
import { SCORE_VERSION, calculateScore } from './scoring'

describe('getDelayDaysForUrgency', () => {
  it('returns 1 for urgency 13 (Immediately)', () => {
    expect(getDelayDaysForUrgency(13)).toBe(1)
  })

  it('returns 1 for urgency 8 (Today)', () => {
    expect(getDelayDaysForUrgency(8)).toBe(1)
  })

  it('returns 2 for urgency 5 (Tomorrow)', () => {
    expect(getDelayDaysForUrgency(5)).toBe(2)
  })

  it('returns 7 for urgency 3 (This Week)', () => {
    expect(getDelayDaysForUrgency(3)).toBe(7)
  })

  it('returns 30 for urgency 2 (This Month)', () => {
    expect(getDelayDaysForUrgency(2)).toBe(30)
  })

  it('returns 90 for urgency 1 (Eventually)', () => {
    expect(getDelayDaysForUrgency(1)).toBe(90)
  })

  it('returns 14 for unknown urgency value (fallback)', () => {
    expect(getDelayDaysForUrgency(99)).toBe(14)
  })
})

describe('buildCloneDocument', () => {
  const baseTask: Task = {
    _id: 'original-task-id',
    title: 'Test Task',
    urgency: 3,
    impact: 8,
    time: 5,
    difficulty: 2,
    repeatOnComplete: true,
    userId: 'user-123',
    status: TASK_STATUS.COMPLETED,
    statusChanged: 1234567890000,
    score: 42.5,
    scoreVersion: 1
  }

  it('copies editable fields (title, urgency, impact, time, difficulty)', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.title).toBe(baseTask.title)
    expect(clone.urgency).toBe(baseTask.urgency)
    expect(clone.impact).toBe(baseTask.impact)
    expect(clone.time).toBe(baseTask.time)
    expect(clone.difficulty).toBe(baseTask.difficulty)
  })

  it('copies repeatOnComplete: true from original', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.repeatOnComplete).toBe(true)
  })

  it('copies userId from original', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.userId).toBe(baseTask.userId)
  })

  it('sets status to TASK_STATUS.NOT_STARTED', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.status).toBe(TASK_STATUS.NOT_STARTED)
  })

  it('does NOT copy _id or statusChanged', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone._id).toBeUndefined()
    expect(clone.statusChanged).toBeUndefined()
  })

  it('sets repeatingOriginId to original _id', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.repeatingOriginId).toBe(baseTask._id)
  })

  it('calculates eligibleAt correctly for urgency 3', () => {
    const nowMs = 1700000000000
    const clone = buildCloneDocument({ ...baseTask, urgency: 3 }, nowMs)

    const expectedEligibleAt = nowMs + 7 * 86400000
    expect(clone.eligibleAt).toBe(expectedEligibleAt)
  })

  it('calculates eligibleAt correctly for urgency 13', () => {
    const nowMs = 1700000000000
    const clone = buildCloneDocument({ ...baseTask, urgency: 13 }, nowMs)

    const expectedEligibleAt = nowMs + 1 * 86400000
    expect(clone.eligibleAt).toBe(expectedEligibleAt)
  })

  it('sets score via calculateScore() with 5% penalty applied', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    const expectedScore = calculateScore({ ...baseTask, repeatingOriginId: baseTask._id }) * 1 // penalty already in calculateScore
    expect(clone.score).toBeDefined()
    expect(typeof clone.score).toBe('number')
    expect(clone.score).toBeGreaterThan(0)
    expect(clone.score).toBeCloseTo(expectedScore, 5)
  })

  it('sets scoreVersion to current SCORE_VERSION', () => {
    const nowMs = Date.now()
    const clone = buildCloneDocument(baseTask, nowMs)

    expect(clone.scoreVersion).toBe(SCORE_VERSION)
  })
})
