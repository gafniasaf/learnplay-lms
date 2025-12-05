/**
 * Computed Properties
 * 
 * Implementation of computed properties from PLAN.md Section F.3
 */

/**
 * Compute progress percentage
 * Formula: (poolSize - pool.length) / poolSize * 100
 * Used in: Progress bar, results
 * 
 * @param poolSize - Original pool size (high water mark)
 * @param currentPoolLength - Current remaining items in pool
 * @returns Progress percentage (0-100)
 */
export function computeProgress(poolSize: number, currentPoolLength: number): number {
  if (poolSize <= 0) return 0;
  const progress = ((poolSize - currentPoolLength) / poolSize) * 100;
  return Math.max(0, Math.min(100, progress));
}

/**
 * Compute accuracy percentage
 * Formula: score / (score + mistakes) * 100
 * Used in: Results page
 * 
 * @param score - Number of correct answers
 * @param mistakes - Number of incorrect answers
 * @returns Accuracy percentage (0-100)
 */
export function computeAccuracy(score: number, mistakes: number): number {
  const total = score + mistakes;
  if (total <= 0) return 0;
  return Math.round((score / total) * 100);
}

/**
 * Compute time per question
 * Formula: elapsedTime / (score + mistakes)
 * Used in: Analytics
 * 
 * @param elapsedTime - Total time elapsed in seconds
 * @param score - Number of correct answers
 * @param mistakes - Number of incorrect answers
 * @returns Average seconds per question
 */
export function computeTimePerQuestion(elapsedTime: number, score: number, mistakes: number): number {
  const total = score + mistakes;
  if (total <= 0) return 0;
  return Math.round((elapsedTime / total) * 10) / 10; // Round to 1 decimal
}

/**
 * Check if an assignment is overdue
 * Formula: dueDate < today && status !== 'completed'
 * Used in: Assignment badges
 * 
 * @param dueDate - Due date string (ISO format) or null
 * @param status - Assignment status
 * @returns True if overdue
 */
export function computeIsOverdue(
  dueDate: string | null | undefined,
  status: string
): boolean {
  if (!dueDate) return false;
  if (status === 'completed' || status === 'graded' || status === 'archived') return false;
  
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return due < today;
}

/**
 * Compute goal progress percentage
 * Formula: currentMinutes / targetMinutes * 100
 * Used in: Dashboard goal card
 * 
 * @param currentMinutes - Minutes completed so far
 * @param targetMinutes - Target minutes goal
 * @returns Goal progress percentage (0-100+, can exceed 100%)
 */
export function computeGoalProgress(currentMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 0;
  return Math.round((currentMinutes / targetMinutes) * 100);
}

/**
 * Get goal status label
 * @param progress - Goal progress percentage
 * @returns Status label: 'ahead', 'on_track', or 'behind'
 */
export function getGoalStatus(progress: number): 'ahead' | 'on_track' | 'behind' {
  if (progress >= 100) return 'ahead';
  if (progress >= 70) return 'on_track';
  return 'behind';
}

/**
 * Format time from seconds to MM:SS or HH:MM:SS
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTime(seconds: number): string {
  if (seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate streak status
 * @param lastActivityDate - Last activity date string
 * @param streakDays - Current streak days
 * @returns Updated streak info
 */
export function calculateStreak(
  lastActivityDate: string | null,
  streakDays: number
): { streakDays: number; streakActive: boolean } {
  if (!lastActivityDate) {
    return { streakDays: 0, streakActive: false };
  }
  
  const lastActivity = new Date(lastActivityDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  lastActivity.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Activity today
    return { streakDays, streakActive: true };
  } else if (diffDays === 1) {
    // Activity yesterday, streak continues
    return { streakDays, streakActive: true };
  } else {
    // Streak broken
    return { streakDays: 0, streakActive: false };
  }
}
