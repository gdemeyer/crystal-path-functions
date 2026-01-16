export interface Task {
    title: String;
    difficulty: number;
    impact: number;
    time: number;
    urgency: number;
    score?: number;
}

export function isTask(obj: any): obj is Task {
    return (
        obj !== undefined &&
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.title === 'string' &&
        typeof obj.difficulty === 'number' &&
        typeof obj.impact === 'number' &&
        typeof obj.time === 'number' &&
        typeof obj.urgency === 'number'
    )
}