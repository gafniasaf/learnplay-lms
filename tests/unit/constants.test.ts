/**
 * Constants Tests
 * Tests that constants are properly exported and have expected values
 */

import {
  DAILY_GOAL_MINUTES,
  WEEKLY_GOAL_MINUTES,
  DAILY_GOAL_ITEMS,
  WEEKLY_GOAL_ITEMS,
  ACCURACY_THRESHOLD_GOOD,
  ACCURACY_THRESHOLD_EXCELLENT,
  MAX_ITEMS_PER_GROUP,
  MAX_VARIANTS,
  DEFAULT_FETCH_TIMEOUT_MS,
  AI_GENERATION_TIMEOUT_MS,
  JOB_POLL_INTERVAL_MS,
  MAX_POLL_DURATION_MS,
  CATALOG_CACHE_MAX_AGE_S,
  COURSE_CACHE_MAX_AGE_S,
  MAX_JOB_RETRIES,
  RATE_LIMIT_JOBS_PER_HOUR,
  HEARTBEAT_INTERVAL_MS,
  STALE_JOB_THRESHOLD_MS,
  BACKOFF_BASE_DELAY_MS,
  BACKOFF_MAX_DELAY_MS,
  BACKOFF_JITTER_FACTOR,
  SEARCH_DEBOUNCE_MS,
  TOAST_DURATION_MS,
  SKELETON_MIN_DISPLAY_MS,
  AUTOSAVE_INTERVAL_MS,
  VIRTUALIZE_THRESHOLD,
  RECENT_SESSIONS_LIMIT,
  RECENT_TOPICS_LIMIT,
  RECENT_ACHIEVEMENTS_LIMIT,
  CHART_DATA_POINTS_LIMIT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_AUDIO_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
  SESSION_TIMEOUT_MS,
  PASSWORD_MIN_LENGTH,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  DEV_VERBOSE_LOGGING,
  MOCK_API_DELAY_MS,
  E2E_DEFAULT_TIMEOUT_MS,
  E2E_NAVIGATION_TIMEOUT_MS,
} from '@/lib/constants';

describe('Learning Goals', () => {
  it('exports daily and weekly goal constants', () => {
    expect(DAILY_GOAL_MINUTES).toBe(20);
    expect(WEEKLY_GOAL_MINUTES).toBe(140);
    expect(DAILY_GOAL_ITEMS).toBe(30);
    expect(WEEKLY_GOAL_ITEMS).toBe(210);
  });

  it('has correct accuracy thresholds', () => {
    expect(ACCURACY_THRESHOLD_GOOD).toBe(80);
    expect(ACCURACY_THRESHOLD_EXCELLENT).toBe(95);
  });

  it('has correct limits', () => {
    expect(MAX_ITEMS_PER_GROUP).toBe(100);
    expect(MAX_VARIANTS).toBe(10);
  });
});

describe('API and Network', () => {
  it('exports timeout constants', () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(30000);
    expect(AI_GENERATION_TIMEOUT_MS).toBe(50000);
  });

  it('exports polling constants', () => {
    expect(JOB_POLL_INTERVAL_MS).toBe(5000);
    expect(MAX_POLL_DURATION_MS).toBe(10 * 60 * 1000);
  });

  it('exports cache constants', () => {
    expect(CATALOG_CACHE_MAX_AGE_S).toBe(3600);
    expect(COURSE_CACHE_MAX_AGE_S).toBe(86400);
  });
});

describe('Job Queue', () => {
  it('exports retry and rate limit constants', () => {
    expect(MAX_JOB_RETRIES).toBe(3);
    expect(RATE_LIMIT_JOBS_PER_HOUR).toBe(10);
  });

  it('exports heartbeat and stale job constants', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(30000);
    expect(STALE_JOB_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });

  it('exports backoff constants', () => {
    expect(BACKOFF_BASE_DELAY_MS).toBe(1000);
    expect(BACKOFF_MAX_DELAY_MS).toBe(60000);
    expect(BACKOFF_JITTER_FACTOR).toBe(0.2);
  });
});

describe('UI and UX', () => {
  it('exports debounce and timing constants', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(TOAST_DURATION_MS).toBe(5000);
    expect(SKELETON_MIN_DISPLAY_MS).toBe(200);
    expect(AUTOSAVE_INTERVAL_MS).toBe(30000);
  });

  it('exports virtualization threshold', () => {
    expect(VIRTUALIZE_THRESHOLD).toBe(100);
  });
});

describe('Analytics and Reporting', () => {
  it('exports limit constants', () => {
    expect(RECENT_SESSIONS_LIMIT).toBe(5);
    expect(RECENT_TOPICS_LIMIT).toBe(3);
    expect(RECENT_ACHIEVEMENTS_LIMIT).toBe(3);
    expect(CHART_DATA_POINTS_LIMIT).toBe(30);
  });
});

describe('Storage and Media', () => {
  it('exports file size limits', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_AUDIO_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_VIDEO_SIZE_BYTES).toBe(15 * 1024 * 1024);
  });

  it('exports supported formats', () => {
    expect(SUPPORTED_IMAGE_FORMATS).toContain('image/jpeg');
    expect(SUPPORTED_IMAGE_FORMATS).toContain('image/png');
    expect(SUPPORTED_AUDIO_FORMATS).toContain('audio/mpeg');
    expect(SUPPORTED_VIDEO_FORMATS).toContain('video/mp4');
  });
});

describe('Security', () => {
  it('exports security constants', () => {
    expect(SESSION_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(MAX_LOGIN_ATTEMPTS).toBe(5);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
  });
});

describe('Development and Testing', () => {
  it('exports dev constants', () => {
    expect(DEV_VERBOSE_LOGGING).toBe(true);
    expect(MOCK_API_DELAY_MS).toBe(500);
    expect(E2E_DEFAULT_TIMEOUT_MS).toBe(30000);
    expect(E2E_NAVIGATION_TIMEOUT_MS).toBe(10000);
  });
});

