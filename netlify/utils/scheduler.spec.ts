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

      // Completed task consumed 2 units, remaining = 4 - 2 = 2
      // Only one active task with effort 2 can fit
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

      // All capacity used (2 + 2 = 4), but top task always included
      expect(result.today.length).toBe(1);
      expect(result.today[0]._id).toBe('3');
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
});
