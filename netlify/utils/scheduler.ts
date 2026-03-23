import { TASK_STATUS } from "../../consts-status";
import { Task } from "../types";
import { utcMsToLocalDate } from "./timezone";

export function partitionTasksForDate(tasks: Task[], date: string, dailyCapacityUnits = 4, timezone?: string) {
  const difficultyMultiplier = (d: number | undefined) => 1 + (( (d ?? 10) - 10) / 20);

  const toDateStr = (ms: number): string =>
    timezone
      ? utcMsToLocalDate(ms, timezone)
      : new Date(ms).toISOString().slice(0, 10);

  const completedToday = (tasks || []).filter(t =>
    t.status === TASK_STATUS.COMPLETED &&
    t.statusChanged &&
    toDateStr(t.statusChanged) === date
  );

  const active = (tasks || []).filter(t => t.status !== TASK_STATUS.COMPLETED);

  // Candidate pool: active tasks + tasks completed today.
  // Sorting is deterministic: score descending, then _id ascending as tie-breaker.
  const candidates = [...active, ...completedToday]
    .sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const aId = a._id ?? '';
      const bId = b._id ?? '';
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });

  // Greedy knapsack over the stable candidate list using FULL dailyCapacityUnits.
  // The first candidate is always included even if it exceeds capacity.
  const selected: Task[] = [];
  let acc = 0;
  for (const task of candidates) {
    const eff = (task.time ?? 0) * difficultyMultiplier(task.difficulty);
    if (selected.length === 0 || acc + eff <= dailyCapacityUnits) {
      selected.push(task);
      acc += eff;
    }
  }

  const selectedSet = new Set(selected);

  // Filter to non-completed tasks so the partition is independent of completion state.
  const today = selected.filter(t => t.status !== TASK_STATUS.COMPLETED);
  const backlog = candidates.filter(t => !selectedSet.has(t) && t.status !== TASK_STATUS.COMPLETED);

  return { today, backlog };
}

export default partitionTasksForDate;
