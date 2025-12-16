/**
 * Application Constants
 * Single source of truth for magic numbers and configuration values
 */

// ============================================
// Game and Learning
// ============================================

/** Default daily learning goal in minutes */
export const DAILY_GOAL_MINUTES = 20;

/** Default weekly learning goal in minutes */
export const WEEKLY_GOAL_MINUTES = 140; // 20 min/day * 7 days

/** Default daily items goal */
export const DAILY_GOAL_ITEMS = 30;

/** Default weekly items goal */
export const WEEKLY_GOAL_ITEMS = 210; // 30 items/day * 7 days

/** Minimum accuracy threshold for "good" performance */
export const ACCURACY_THRESHOLD_GOOD = 80; // 80%

/** Minimum accuracy threshold for "excellent" performance */
export const ACCURACY_THRESHOLD_EXCELLENT = 95; // 95%

/** Maximum items per group for course generation */
export const MAX_ITEMS_PER_GROUP = 100;

/** Maximum cluster variants per item */
export const MAX_VARIANTS = 10;

// ============================================
// API and Network
// ============================================

/** Default fetch timeout in milliseconds */
export const DEFAULT_FETCH_TIMEOUT_MS = 30000; // 30 seconds

/** AI generation timeout in milliseconds */
export const AI_GENERATION_TIMEOUT_MS = 50000; // 50 seconds

/** Polling interval for job status in milliseconds */
export const JOB_POLL_INTERVAL_MS = 5000; // 5 seconds

/** Maximum polling duration in milliseconds */
export const MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/** HTTP cache max-age for catalog in seconds */
export const CATALOG_CACHE_MAX_AGE_S = 3600; // 1 hour

/** HTTP cache max-age for courses in seconds */
export const COURSE_CACHE_MAX_AGE_S = 86400; // 24 hours

// ============================================
// Job Queue
// ============================================

/** Maximum retry attempts for failed jobs */
export const MAX_JOB_RETRIES = 3;

/** Job rate limit: max jobs per hour per user */
export const RATE_LIMIT_JOBS_PER_HOUR = 10;

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

/** Stale job threshold in milliseconds */
export const STALE_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/** Exponential backoff base delay in milliseconds */
export const BACKOFF_BASE_DELAY_MS = 1000; // 1 second

/** Exponential backoff max delay in milliseconds */
export const BACKOFF_MAX_DELAY_MS = 60000; // 60 seconds

/** Exponential backoff jitter factor (±20%) */
export const BACKOFF_JITTER_FACTOR = 0.2;

// ============================================
// UI and UX
// ============================================

/** Debounce delay for search input in milliseconds */
export const SEARCH_DEBOUNCE_MS = 300;

/** Toast notification duration in milliseconds */
export const TOAST_DURATION_MS = 5000; // 5 seconds

/** Skeleton loader minimum display time in milliseconds */
export const SKELETON_MIN_DISPLAY_MS = 200;

/** Auto-save draft interval in milliseconds */
export const AUTOSAVE_INTERVAL_MS = 30000; // 30 seconds

/** Virtualization threshold: list size to trigger virtualization */
export const VIRTUALIZE_THRESHOLD = 100;

// ============================================
// Analytics and Reporting
// ============================================

/** Recent sessions limit for parent/student dashboards */
export const RECENT_SESSIONS_LIMIT = 5;

/** Recent topics limit for parent dashboard */
export const RECENT_TOPICS_LIMIT = 3;

/** Recent achievements limit for student dashboard */
export const RECENT_ACHIEVEMENTS_LIMIT = 3;

/** Chart data points limit */
export const CHART_DATA_POINTS_LIMIT = 30;

// ============================================
// Storage and Media
// ============================================

/** Maximum image upload size in bytes */
export const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Maximum audio upload size in bytes */
export const MAX_AUDIO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Maximum video upload size in bytes */
export const MAX_VIDEO_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

/** Supported image formats */
export const SUPPORTED_IMAGE_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Supported audio formats */
export const SUPPORTED_AUDIO_FORMATS = ['audio/mpeg', 'audio/ogg', 'audio/wav'];

/** Supported video formats */
export const SUPPORTED_VIDEO_FORMATS = ['video/mp4', 'video/webm', 'video/ogg'];

// ============================================
// Security
// ============================================

/** Session timeout in milliseconds */
export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Password minimum length */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum login attempts before lockout */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Lockout duration in milliseconds */
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// ============================================
// Development and Testing
// ============================================

/** Enable verbose logging in development */
export const DEV_VERBOSE_LOGGING = true;

/** E2E test default timeout in milliseconds */
export const E2E_DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/** E2E test navigation timeout in milliseconds */
export const E2E_NAVIGATION_TIMEOUT_MS = 10000; // 10 seconds

