/**
 * Computed Properties Tests
 */

import {
  computeProgress,
  computeAccuracy,
  computeTimePerQuestion,
  computeIsOverdue,
  computeGoalProgress,
  getGoalStatus,
  formatTime,
  calculateStreak,
} from '@/lib/computed';

describe('computeProgress', () => {
  it('returns 0 for empty pool', () => {
    expect(computeProgress(10, 10)).toBe(0);
  });

  it('returns 100 for completed pool', () => {
    expect(computeProgress(10, 0)).toBe(100);
  });

  it('returns correct percentage for partial progress', () => {
    expect(computeProgress(10, 5)).toBe(50);
    expect(computeProgress(10, 7)).toBe(30);
    expect(computeProgress(10, 2)).toBe(80);
  });

  it('handles zero pool size', () => {
    expect(computeProgress(0, 0)).toBe(0);
  });

  it('clamps to 0-100 range', () => {
    expect(computeProgress(10, 15)).toBe(0); // Negative clamped to 0
    expect(computeProgress(10, -5)).toBe(100); // Over 100 clamped
  });
});

describe('computeAccuracy', () => {
  it('returns 0 for no answers', () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  it('returns 100 for perfect score', () => {
    expect(computeAccuracy(10, 0)).toBe(100);
  });

  it('returns 0 for all wrong', () => {
    expect(computeAccuracy(0, 10)).toBe(0);
  });

  it('calculates correct percentage', () => {
    expect(computeAccuracy(8, 2)).toBe(80);
    expect(computeAccuracy(7, 3)).toBe(70);
    expect(computeAccuracy(1, 1)).toBe(50);
  });

  it('rounds to nearest integer', () => {
    expect(computeAccuracy(2, 3)).toBe(40); // 40%
    expect(computeAccuracy(1, 2)).toBe(33); // 33.33% rounds to 33
  });
});

describe('computeTimePerQuestion', () => {
  it('returns 0 for no questions answered', () => {
    expect(computeTimePerQuestion(60, 0, 0)).toBe(0);
  });

  it('calculates average time correctly', () => {
    expect(computeTimePerQuestion(100, 10, 0)).toBe(10);
    expect(computeTimePerQuestion(60, 5, 5)).toBe(6);
  });

  it('rounds to one decimal place', () => {
    expect(computeTimePerQuestion(100, 3, 0)).toBe(33.3);
    expect(computeTimePerQuestion(10, 3, 0)).toBe(3.3);
  });
});

describe('computeIsOverdue', () => {
  it('returns false for null due date', () => {
    expect(computeIsOverdue(null, 'in_progress')).toBe(false);
    expect(computeIsOverdue(undefined, 'draft')).toBe(false);
  });

  it('returns false for completed assignments', () => {
    const pastDate = '2020-01-01T00:00:00Z';
    expect(computeIsOverdue(pastDate, 'completed')).toBe(false);
    expect(computeIsOverdue(pastDate, 'graded')).toBe(false);
    expect(computeIsOverdue(pastDate, 'archived')).toBe(false);
  });

  it('returns true for past due dates with active status', () => {
    const pastDate = '2020-01-01T00:00:00Z';
    expect(computeIsOverdue(pastDate, 'draft')).toBe(true);
    expect(computeIsOverdue(pastDate, 'in_progress')).toBe(true);
    expect(computeIsOverdue(pastDate, 'scheduled')).toBe(true);
  });

  it('returns false for future due dates', () => {
    const futureDate = '2099-12-31T00:00:00Z';
    expect(computeIsOverdue(futureDate, 'draft')).toBe(false);
    expect(computeIsOverdue(futureDate, 'in_progress')).toBe(false);
  });
});

describe('computeGoalProgress', () => {
  it('returns 0 for zero target', () => {
    expect(computeGoalProgress(30, 0)).toBe(0);
  });

  it('returns 0 for zero current', () => {
    expect(computeGoalProgress(0, 60)).toBe(0);
  });

  it('calculates correct percentage', () => {
    expect(computeGoalProgress(30, 60)).toBe(50);
    expect(computeGoalProgress(60, 60)).toBe(100);
    expect(computeGoalProgress(45, 60)).toBe(75);
  });

  it('can exceed 100%', () => {
    expect(computeGoalProgress(90, 60)).toBe(150);
    expect(computeGoalProgress(120, 60)).toBe(200);
  });
});

describe('getGoalStatus', () => {
  it('returns ahead for 100% or more', () => {
    expect(getGoalStatus(100)).toBe('ahead');
    expect(getGoalStatus(150)).toBe('ahead');
  });

  it('returns on_track for 70-99%', () => {
    expect(getGoalStatus(70)).toBe('on_track');
    expect(getGoalStatus(85)).toBe('on_track');
    expect(getGoalStatus(99)).toBe('on_track');
  });

  it('returns behind for less than 70%', () => {
    expect(getGoalStatus(0)).toBe('behind');
    expect(getGoalStatus(50)).toBe('behind');
    expect(getGoalStatus(69)).toBe('behind');
  });
});

describe('formatTime', () => {
  it('formats seconds only', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(600)).toBe('10:00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7325)).toBe('2:02:05');
  });

  it('handles negative values', () => {
    expect(formatTime(-10)).toBe('0:00');
  });
});

describe('calculateStreak', () => {
  it('returns zero streak for null last activity', () => {
    const result = calculateStreak(null, 5);
    expect(result.streakDays).toBe(0);
    expect(result.streakActive).toBe(false);
  });

  it('maintains streak for activity today', () => {
    const today = new Date().toISOString();
    const result = calculateStreak(today, 5);
    expect(result.streakDays).toBe(5);
    expect(result.streakActive).toBe(true);
  });

  it('maintains streak for activity yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = calculateStreak(yesterday.toISOString(), 5);
    expect(result.streakDays).toBe(5);
    expect(result.streakActive).toBe(true);
  });

  it('breaks streak for activity 2+ days ago', () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const result = calculateStreak(twoDaysAgo.toISOString(), 5);
    expect(result.streakDays).toBe(0);
    expect(result.streakActive).toBe(false);
  });
});



