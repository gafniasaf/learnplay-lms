import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Session state for game rounds (frontend only, no backend yet)
 */
interface SessionState {
  // Current session/round identifiers
  sessionId: string | null;
  roundId: string | null;
  
  // Game metadata
  courseId: string | null;
  level: number;
  
  // Round start time
  startedAt: string | null;
  
  // Actions
  startSession: (courseId: string, level: number, sessionId: string, roundId: string) => void;
  endSession: () => void;
  reset: () => void;
}

/**
 * Zustand store for session management
 * Persisted to localStorage for resuming sessions
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      // Initial state
      sessionId: null,
      roundId: null,
      courseId: null,
      level: 1,
      startedAt: null,

      // Start a new session/round
      startSession: (courseId, level, sessionId, roundId) => {
        set({
          sessionId,
          roundId,
          courseId,
          level,
          startedAt: new Date().toISOString(),
        });
      },

      // End current session (keep data for reference)
      endSession: () => {
        set({
          startedAt: null,
        });
      },

      // Clear all session data
      reset: () => {
        set({
          sessionId: null,
          roundId: null,
          courseId: null,
          level: 1,
          startedAt: null,
        });
      },
    }),
    {
      name: "LearnPlay-session",
      version: 1,
    }
  )
);

/**
 * Helper: Check if there's an active session
 */
export function hasActiveSession(): boolean {
  const { sessionId, roundId, startedAt } = useSessionStore.getState();
  return !!(sessionId && roundId && startedAt);
}

/**
 * Helper: Get current session info
 */
export function getCurrentSession() {
  return useSessionStore.getState();
}
