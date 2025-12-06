/**
 * API Response Types for Supabase Edge Functions
 * These types define the expected responses from backend edge functions
 */

// ============= Session Management =============

export interface StartSessionRequest {
  userId: string;
  courseId: string;
}

export interface StartSessionResponse {
  sessionId: string;
  userId: string;
  courseId: string;
  startedAt: string;
}

// ============= Round Management =============

export interface StartRoundRequest {
  sessionId: string;
  courseId: string;
  level: number;
  userId?: string;
}

export interface StartRoundResponse {
  roundId: string;
  sessionId: string;
  level: number;
  startedAt: string;
}

export interface LogAttemptRequest {
  roundId: string;
  itemId: number;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpent: number;
}

export interface LogAttemptResponse {
  attemptId: string;
  success: boolean;
  timestamp: string;
}

export interface EndRoundRequest {
  roundId: string;
  score: number;
  mistakes: number;
  elapsedTime: number;
}

export interface EndRoundResponse {
  roundId: string;
  score: number;
  mistakes: number;
  accuracy: number;
  completedAt: string;
  levelCompleted: boolean;
  nextLevel?: number;
}

// ============= Dashboard Data =============

export interface GetDashboardRequest {
  userId: string;
  role: "student" | "teacher" | "parent" | "school" | "admin";
}

// Dashboard responses use the existing Dashboard types
// Re-export them for convenience
export type { Dashboard, DashboardRole } from "./dashboard";

// ============= Error Handling =============

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

// ============= Edge Function Names =============

export const EDGE_FUNCTIONS = {
  START_SESSION: "play-session",
  START_ROUND: "game-start-round",
  LOG_ATTEMPT: "game-log-attempt",
  END_ROUND: "game-end-round",
  GET_DASHBOARD: "get-dashboard",
  GET_COURSE: "get-course",
} as const;

export type EdgeFunctionName = typeof EDGE_FUNCTIONS[keyof typeof EDGE_FUNCTIONS];
