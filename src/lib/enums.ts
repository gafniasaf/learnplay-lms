/**
 * TypeScript Enums for Type-Safe String Literals
 * Replaces magic strings throughout the codebase
 */

// ============================================
// User Roles
// ============================================

export enum UserRole {
  Student = 'student',
  Teacher = 'teacher',
  Parent = 'parent',
  School = 'school',
  Admin = 'admin',
}

// ============================================
// API and Environment
// ============================================

export enum ApiMode {
  Mock = 'mock',
  Live = 'live',
}

export enum Environment {
  Development = 'development',
  Preview = 'preview',
  Production = 'production',
}

// ============================================
// Job Queue
// ============================================

export enum JobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Done = 'done',
  Failed = 'failed',
  DeadLetter = 'dead_letter',
  Stale = 'stale',
}

export enum JobType {
  Course = 'course',
  Media = 'media',
}

export enum AIProvider {
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  ElevenLabs = 'elevenlabs',
  Replicate = 'replicate',
}

// ============================================
// Assignments
// ============================================

export enum AssignmentStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Overdue = 'overdue',
  Graded = 'graded',
}

// ============================================
// Course and Content
// ============================================

export enum CourseMode {
  Options = 'options',
  Numeric = 'numeric',
}

export enum StimulusType {
  Image = 'image',
  Audio = 'audio',
  Video = 'video',
}

export enum GradeBand {
  PreK = 'Pre-K',
  K2 = 'K-2',
  Gr36 = '3-6',
  Gr68 = '6-8',
  Gr912 = '9-12',
  AllGrades = 'All Grades',
}

// ============================================
// Time Ranges
// ============================================

export enum TimeRange {
  Day = 'day',
  Week = 'week',
  Month = 'month',
}

// ============================================
// Media Types
// ============================================

export enum MediaType {
  Image = 'image',
  Audio = 'audio',
  Video = 'video',
}

// ============================================
// Message Types
// ============================================

export enum MessageType {
  Direct = 'direct',
  Class = 'class',
  Announcement = 'announcement',
}

export enum MessageStatus {
  Unread = 'unread',
  Read = 'read',
  Archived = 'archived',
}

// ============================================
// Organization Roles
// ============================================

export enum OrgRole {
  Owner = 'owner',
  Admin = 'admin',
  Member = 'member',
  Guest = 'guest',
}

// ============================================
// Error Types
// ============================================

export enum ApiErrorCode {
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Timeout = 'TIMEOUT',
  RateLimit = 'RATE_LIMIT',
  ValidationError = 'VALIDATION_ERROR',
  InternalError = 'INTERNAL_ERROR',
  ConfigError = 'CONFIG_ERROR',
}

// ============================================
// Log Levels
// ============================================

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

