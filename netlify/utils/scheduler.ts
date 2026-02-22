import { TASK_STATUS } from "../../consts-status";
import { Task } from "../types";

export function partitionTasksForDate(tasks: Task[], date: string, dailyCapacityUnits = 4) {
  const difficultyMultiplier = (d: number | undefined) => 1 + (( (d ?? 10) - 10) / 20);

  const completedToday = (tasks || []).filter(t =>
    t.status === TASK_STATUS.COMPLETED &&
    t.statusChanged &&
    new Date(t.statusChanged).toISOString().slice(0, 10) === date
  );

  const used = completedToday.reduce((sum, t) => {
    const mult = difficultyMultiplier(t.difficulty);
    return sum + ((t.time ?? 0) * mult);
  }, 0);

  const remaining = Math.max(dailyCapacityUnits - used, 0);

  const active = (tasks || []).filter(t => t.status !== TASK_STATUS.COMPLETED)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const today: Task[] = [];
  let acc = 0;
  for (const task of active) {
    const eff = (task.time ?? 0) * difficultyMultiplier(task.difficulty);
    if (today.length === 0 || acc + eff <= remaining) {
      today.push(task);
      acc += eff;
    }
  }

  const backlog = active.filter(t => !today.includes(t));

  return { today, backlog };
}

export default partitionTasksForDate;
