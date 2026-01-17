/**
 * Task Status Constants
 * Defines all possible statuses for tasks
 * Can be extended with additional statuses in the future
 */

export const TASK_STATUS = {
    NOT_STARTED: 'NOT_STARTED',
    COMPLETED: 'COMPLETED',
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

export const isValidStatus = (status: any): status is TaskStatus => {
    return Object.values(TASK_STATUS).includes(status);
};
