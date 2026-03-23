import { describe, it, expect } from 'vitest';
import { partitionTasksForDate } from './scheduler';
import { Task } from '../types';
import { TASK_STATUS } from '../../consts-status';

describe('scheduler - partitionTasksForDate', () => {
  const testDate = '2026-02-10';

  describe('Basic partitioning', () => {
    it('should put all tasks in today when they fit within capacity', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      expect(result.today.length).toBe(2);
      expect(result.backlog.length).toBe(0);
      expect(result.today[0]._id).toBe('1');
      expect(result.today[1]._id).toBe('2');
    });

    it('should move tasks to backlog when capacity is exceeded', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Task 1', difficulty: 10, impact: 15, time: 3, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Task 2', difficulty: 10, impact: 10, time: 3, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Task 3', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 60, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      expect(result.today.length).toBe(1);
      expect(result.backlog.length).toBe(2);
      expect(result.today[0]._id).toBe('1');
      expect(result.backlog.map(t => t._id)).toEqual(['2', '3']);
    });

    it('should always include the top task even if it exceeds capacity', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Big Task', difficulty: 15, impact: 20, time: 10, urgency: 15, score: 200, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Small Task', difficulty: 5, impact: 10, time: 1, urgency: 5, score: 100, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('1');
      expect(result.backlog.length).toBe(1);
      expect(result.backlog[0]._id).toBe('2');
    });
  });

  describe('Difficulty multiplier correctness', () => {
    it('should calculate effective effort using difficulty multiplier', () => {
      // difficulty=3: multiplier = 1 + (3-10)/20 = 1 + (-7/20) = 1 - 0.35 = 0.65
      // time=5: effective effort = 5 * 0.65 = 3.25
      // difficulty=10: multiplier = 1 + (10-10)/20 = 1
      // time=3: effective effort = 3 * 1 = 3
      // Total = 3.25 + 3 = 6.25, exceeds capacity of 4
      const tasks: Task[] = [
        { _id: '1', title: 'Easy Task', difficulty: 3, impact: 15, time: 5, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Normal Task', difficulty: 10, impact: 10, time: 3, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // First task should fit (3.25 < 4), but adding second would exceed (6.25 > 4)
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('1');
      expect(result.backlog.length).toBe(1);
    });

    it('should handle high difficulty tasks with higher effort', () => {
      // difficulty=18: multiplier = 1 + (18-10)/20 = 1 + 0.4 = 1.4
      // time=2: effective effort = 2 * 1.4 = 2.8
      const tasks: Task[] = [
        { _id: '1', title: 'Hard Task', difficulty: 18, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Another Hard Task', difficulty: 18, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // First task: 2.8, second task: 2.8, total = 5.6 > 4
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('1');
    });
  });

  describe('Completed-today capacity consumption', () => {
    it('should reduce remaining capacity based on tasks completed today', () => {
      const completedTodayTimestamp = new Date('2026-02-10T10:00:00Z').getTime();
      const tasks: Task[] = [
        { _id: '1', title: 'Completed Task', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: completedTodayTimestamp },
        { _id: '2', title: 'Active Task 1', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Active Task 2', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // Knapsack over all 3 (capacity=4): completed(acc=2), active1(acc=4), active2(6>4 skip).
      // today returns only non-completed tasks: [active1]; backlog: [active2].
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('2');
      expect(result.backlog.length).toBe(1);
      expect(result.backlog[0]._id).toBe('3');
    });

    it('should not count tasks completed on different dates', () => {
      const yesterdayTimestamp = new Date('2026-02-09T10:00:00Z').getTime();
      const tasks: Task[] = [
        { _id: '1', title: 'Completed Yesterday', difficulty: 10, impact: 15, time: 10, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: yesterdayTimestamp },
        { _id: '2', title: 'Active Task 1', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Active Task 2', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // Yesterday's completion doesn't affect today's capacity
      expect(result.today.length).toBe(2);
      expect(result.today.map(t => t._id)).toEqual(['2', '3']);
    });

    it('should handle when all capacity is used by completed tasks', () => {
      const completedTodayTimestamp = new Date('2026-02-10T10:00:00Z').getTime();
      const tasks: Task[] = [
        { _id: '1', title: 'Completed Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: completedTodayTimestamp },
        { _id: '2', title: 'Completed Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.COMPLETED, statusChanged: completedTodayTimestamp },
        { _id: '3', title: 'Active Task', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // Knapsack over all 3 (capacity=4): completed1(acc=2), completed2(acc=4), active(6>4 skip).
      // Both knapsack slots are occupied by completed tasks; active task doesn't fit.
      // today returns only non-completed selected tasks → []; backlog returns non-completed unselected → [active].
      expect(result.today).toEqual([]);
      expect(result.backlog.length).toBe(1);
      expect(result.backlog[0]._id).toBe('3');
    });
  });

  describe('Empty and edge cases', () => {
    it('should return empty arrays when no tasks provided', () => {
      const result = partitionTasksForDate([], testDate, 4);

      expect(result.today).toEqual([]);
      expect(result.backlog).toEqual([]);
    });

    it('should return empty arrays when all tasks are completed', () => {
      const completedTimestamp = new Date('2026-02-09T10:00:00Z').getTime();
      const tasks: Task[] = [
        { _id: '1', title: 'Completed Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: completedTimestamp },
        { _id: '2', title: 'Completed Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.COMPLETED, statusChanged: completedTimestamp },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      expect(result.today).toEqual([]);
      expect(result.backlog).toEqual([]);
    });

    it('should handle tasks with missing optional fields', () => {
      const tasks: Task[] = [
        { title: 'Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, status: TASK_STATUS.NOT_STARTED },
        { title: 'Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      expect(result.today.length).toBe(2);
      expect(result.backlog.length).toBe(0);
    });
  });

  describe('Score ordering', () => {
    it('should partition tasks in score-descending order', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Low Score', difficulty: 10, impact: 5, time: 2, urgency: 3, score: 60, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Medium Score', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'High Score', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // Should select highest scores first (high and medium fit, low goes to backlog)
      expect(result.today.length).toBe(2);
      expect(result.today[0]._id).toBe('3'); // Highest score
      expect(result.today[1]._id).toBe('2'); // Medium score
      expect(result.backlog.length).toBe(1);
      expect(result.backlog[0]._id).toBe('1'); // Lowest score
    });

    it('should sort backlog by score descending', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Highest', difficulty: 10, impact: 20, time: 3, urgency: 15, score: 150, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Lowest', difficulty: 10, impact: 5, time: 2, urgency: 3, score: 50, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Middle', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);

      // Only highest fits (effort = 3), others go to backlog
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('1');
      expect(result.backlog.length).toBe(2);
      expect(result.backlog[0]._id).toBe('3'); // Score 80
      expect(result.backlog[1]._id).toBe('2'); // Score 50
    });
  });

  describe('Default capacity', () => {
    it('should use default capacity of 4 when not specified', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Task 3', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 60, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate); // No capacity param

      // With default capacity of 4, two tasks fit (2 + 2 = 4)
      expect(result.today.length).toBe(2);
      expect(result.backlog.length).toBe(1);
    });

    it('should allow custom capacity values', () => {
      const tasks: Task[] = [
        { _id: '1', title: 'Task 1', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
        { _id: '2', title: 'Task 2', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Task 3', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 60, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 6);

      // With capacity of 6, all three tasks fit (2 + 2 + 2 = 6)
      expect(result.today.length).toBe(3);
      expect(result.backlog.length).toBe(0);
    });
  });

  describe('Timezone-aware completion matching', () => {
    it('should match completed task to correct local date when timezone supplied', () => {
      // 2026-02-11 03:00 UTC = 2026-02-10 22:00 EST
      // Without timezone this timestamp is Feb 11 (UTC), with timezone it is Feb 10 (local)
      const lateEveningEstAsUtc = new Date('2026-02-11T03:00:00Z').getTime();

      const tasks: Task[] = [
        { _id: '1', title: 'Completed late', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: lateEveningEstAsUtc },
        { _id: '2', title: 'Active Task 1', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.NOT_STARTED },
        { _id: '3', title: 'Active Task 2', difficulty: 10, impact: 8, time: 2, urgency: 3, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: '4', title: 'Active Task 3', difficulty: 10, impact: 6, time: 2, urgency: 2, score: 70, status: TASK_STATUS.NOT_STARTED },
      ];

      // Without timezone: Feb 11 UTC ≠ Feb 10, so no capacity consumed
      // All 3 active tasks fit (2+2+2=6 ≤ 6)
      const withoutTz = partitionTasksForDate(tasks, testDate, 6);
      expect(withoutTz.today.length).toBe(3);

      // With timezone (EST): completed task's local date IS Feb 10 → included in candidate pool.
      // Knapsack (capacity=6): completed(2), active1(4), active2(6), active3(8>6 skip).
      // today returns non-completed selected tasks: [active1, active2]; backlog: [active3].
      const withTz = partitionTasksForDate(tasks, testDate, 6, 'America/New_York');
      expect(withTz.today.length).toBe(2);
      expect(withTz.backlog.length).toBe(1);
    });

    it('should exclude tasks completed on a different local date', () => {
      // 2026-02-09 20:00 UTC = 2026-02-10 05:00 JST (next day in Tokyo)
      const eveningUtc = new Date('2026-02-09T20:00:00Z').getTime();

      const tasks: Task[] = [
        { _id: '1', title: 'Completed', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: eveningUtc },
        { _id: '2', title: 'Active', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.NOT_STARTED },
      ];

      // UTC date is Feb 9 → no match for Feb 10
      const withoutTz = partitionTasksForDate(tasks, testDate, 4);
      expect(withoutTz.today.length).toBe(1); // no capacity consumed, only active fits fully

      // Tokyo local date is Feb 10 → matches testDate
      const withTzTokyo = partitionTasksForDate(tasks, testDate, 4, 'Asia/Tokyo');
      expect(withTzTokyo.today.length).toBe(1);
      expect(withTzTokyo.today[0]._id).toBe('2'); // capacity reduced
    });

    it('should still work correctly without timezone (backward-compatible)', () => {
      const completedTodayTimestamp = new Date('2026-02-10T10:00:00Z').getTime();
      const tasks: Task[] = [
        { _id: '1', title: 'Completed', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.COMPLETED, statusChanged: completedTodayTimestamp },
        { _id: '2', title: 'Active', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 90, status: TASK_STATUS.NOT_STARTED },
      ];

      const result = partitionTasksForDate(tasks, testDate, 4);
      // Completed task occupies its knapsack slot (acc=2), active task also fits (2+2=4)
      // today returns only non-completed tasks
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('2');
    });
  });

  describe('Determinism across completion states', () => {
    const date = '2026-03-23';
    const todayMs = new Date('2026-03-23T14:00:00Z').getTime();

    // capacity=4: a(eff=3) selected first; b(3+2=5>4) skip; c(3+1.5=4.5>4) skip
    // Reference: today=['a'], backlog=['b','c']
    const tasksAllActive: Task[] = [
      { _id: 'a', title: 'A', difficulty: 10, impact: 15, time: 3, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
      { _id: 'b', title: 'B', difficulty: 10, impact: 10, time: 2, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      { _id: 'c', title: 'C', difficulty: 10, impact: 8, time: 1.5, urgency: 3, score: 60, status: TASK_STATUS.NOT_STARTED },
    ];

    it('Test 1 - same partition when all tasks are active', () => {
      const refResult = partitionTasksForDate(tasksAllActive, date, 4);

      expect(refResult.today.map(t => t._id)).toEqual(['a']);
      expect(refResult.backlog.map(t => t._id)).toEqual(['b', 'c']);
    });

    it('Test 2 - same partition when top task is completed today (core bug regression)', () => {
      const refResult = partitionTasksForDate(tasksAllActive, date, 4);

      const tasksACompleted = tasksAllActive.map(t =>
        t._id === 'a'
          ? { ...t, status: TASK_STATUS.COMPLETED, statusChanged: todayMs }
          : t
      );
      const afterResult = partitionTasksForDate(tasksACompleted, date, 4);

      // Backlog IDs are identical to the reference backlog
      expect(afterResult.backlog.map(t => t._id)).toEqual(refResult.backlog.map(t => t._id));
      // Today IDs equal reference today filtered to exclude completed task 'a'
      expect(afterResult.today.map(t => t._id)).toEqual(
        refResult.today.filter(t => t._id !== 'a').map(t => t._id)
      );
    });

    it('Test 3 - all tasks completed today yields empty arrays', () => {
      const allCompleted = tasksAllActive.map(t => ({
        ...t,
        status: TASK_STATUS.COMPLETED,
        statusChanged: todayMs,
      }));

      const result = partitionTasksForDate(allCompleted, date, 4);

      expect(result.today).toEqual([]);
      expect(result.backlog).toEqual([]);
    });

    it('Test 4 - partition stable across input array order', () => {
      const refResult = partitionTasksForDate(tasksAllActive, date, 4);

      // Shuffle to [c, a, b]
      const shuffled: Task[] = [tasksAllActive[2], tasksAllActive[0], tasksAllActive[1]];
      const shuffledResult = partitionTasksForDate(shuffled, date, 4);

      expect(shuffledResult.today.map(t => t._id)).toEqual(refResult.today.map(t => t._id));
      expect(shuffledResult.backlog.map(t => t._id)).toEqual(refResult.backlog.map(t => t._id));
    });

    it('Test 5 - tie-breaking by _id ascending when scores are equal', () => {
      const tasks: Task[] = [
        { _id: 'z', title: 'Task Z', difficulty: 10, impact: 10, time: 3, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
        { _id: 'a', title: 'Task A', difficulty: 10, impact: 10, time: 3, urgency: 5, score: 80, status: TASK_STATUS.NOT_STARTED },
      ];
      // Both scores equal; capacity=4, each effort=3; only one fits
      // Tie-break: 'a' < 'z' so 'a' comes first → today=['a'], backlog=['z']

      const result = partitionTasksForDate(tasks, date, 4);
      expect(result.today.map(t => t._id)).toEqual(['a']);
      expect(result.backlog.map(t => t._id)).toEqual(['z']);

      // Reversed input order must yield the same result
      const reversed: Task[] = [tasks[1], tasks[0]];
      const reversedResult = partitionTasksForDate(reversed, date, 4);
      expect(reversedResult.today.map(t => t._id)).toEqual(['a']);
      expect(reversedResult.backlog.map(t => t._id)).toEqual(['z']);
    });

    it('Test 6 - single task: today when active, today empty when completed today', () => {
      const taskActive: Task[] = [
        { _id: '1', title: 'Solo', difficulty: 10, impact: 15, time: 2, urgency: 10, score: 100, status: TASK_STATUS.NOT_STARTED },
      ];
      const resultActive = partitionTasksForDate(taskActive, date, 4);
      expect(resultActive.today.map(t => t._id)).toEqual(['1']);
      expect(resultActive.backlog).toEqual([]);

      const taskCompleted: Task[] = [
        { ...taskActive[0], status: TASK_STATUS.COMPLETED, statusChanged: todayMs },
      ];
      const resultCompleted = partitionTasksForDate(taskCompleted, date, 4);
      expect(resultCompleted.today).toEqual([]);
      expect(resultCompleted.backlog).toEqual([]);
    });

    it('Test 7 - empty task list yields empty arrays', () => {
      const result = partitionTasksForDate([], date, 4);
      expect(result.today).toEqual([]);
      expect(result.backlog).toEqual([]);
    });
  });
});
