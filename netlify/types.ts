export interface Task {
    title: String;
    difficulty: number;
    impact: number;
    time: number;
    urgency: number;
}

export function isTask(obj: any): obj is Task {
    return obj !== undefined
}