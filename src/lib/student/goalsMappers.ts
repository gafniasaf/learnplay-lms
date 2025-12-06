import type { StudentGoalsResponse } from '@/lib/api/studentGoals';

export interface StudentGoalProgressSummary {
  goalMinutes: number;
  actualMinutes: number;
  goalItems: number;
  actualItems: number;
}

const clampToGoal = (value: number, goal: number) => {
  if (goal <= 0) return value;
  return Math.min(value, goal);
};

export function aggregateStudentGoalProgress(
  response?: StudentGoalsResponse | null
): StudentGoalProgressSummary | null {
  if (!response || !Array.isArray(response.goals) || response.goals.length === 0) {
    return null;
  }

  const activeGoals = response.goals.filter((goal) => goal.status !== 'completed');
  const completedGoals = response.goals.filter((goal) => goal.status === 'completed');

  const minutesSource = activeGoals.length > 0 ? activeGoals : response.goals;

  const rawGoalMinutes = minutesSource.reduce(
    (sum, goal) => sum + Math.max(goal.targetMinutes, 0),
    0
  );

  const rawActualMinutes = minutesSource.reduce(
    (sum, goal) => sum + clampToGoal(Math.max(goal.progressMinutes, 0), Math.max(goal.targetMinutes, 0)),
    0
  );

  const summary = response.summary ?? {
    total: response.goals.length,
    onTrack: 0,
    behind: 0,
    completed: completedGoals.length,
  };

  const goalMinutes = rawGoalMinutes > 0 ? rawGoalMinutes : 1;
  const actualMinutes = Math.min(rawActualMinutes, goalMinutes);

  const goalItems = summary.total > 0 ? summary.total : Math.max(response.goals.length, 1);
  const actualItems = Math.min(summary.completed ?? completedGoals.length, goalItems);

  return {
    goalMinutes,
    actualMinutes,
    goalItems,
    actualItems,
  };
}

