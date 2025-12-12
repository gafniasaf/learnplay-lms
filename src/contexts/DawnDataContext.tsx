/**
 * LearnPlay Data Context
 * Provides centralized data loading and state management for entity records
 * 
 * Entity names match system-manifest.json:
 * - LearnerProfile (learner-profile)
 * - Assignment (assignment)
 * - CourseBlueprint (course-blueprint)
 * - MessageThread (message-thread)
 * - JobTicket (job-ticket)
 * - SessionEvent (session-event)
 * - GoalUpdate (goal-update)
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useMCP } from "@/hooks/useMCP";
import { useAuth } from "@/hooks/useAuth";

// Entity types from LearnPlay manifest (system-manifest.json)
export interface LearnerProfile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  grade_level?: string;
  weekly_goal_minutes?: number;
  current_assignment_id?: string;
  goal_status?: string;
  insights_snapshot?: Record<string, unknown>;
}

export interface Assignment {
  id: string;
  title?: string;
  status: 'draft' | 'scheduled' | 'in_progress' | 'graded' | 'archived';
  subject?: string;
  due_date?: string;
  adaptive_cluster_id?: string;
  ai_variant_id?: string;
  learner_id?: string;
  teacher_id?: string;
  rubric?: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

export interface CourseBlueprint {
  id: string;
  title?: string;
  subject?: string;
  difficulty: 'elementary' | 'middle' | 'high' | 'college';
  catalog_path?: string;
  multimedia_manifest?: Record<string, unknown>;
  guard_status: 'pending' | 'passed' | 'failed';
  published?: boolean;
  notes?: string;
}

export interface MessageThread {
  id: string;
  title?: string;
  participant_ids?: string[];
  last_message?: string;
  unread_counts?: Record<string, number>;
  pinned?: boolean;
}

export interface JobTicket {
  id: string;
  job_type?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  target_id?: string;
}

export interface SessionEvent {
  id: string;
  assignment_id?: string;
  question_ref?: string;
  outcome: 'correct' | 'incorrect' | 'skipped' | 'hint';
  duration_seconds?: number;
  transcript?: string;
  confidence_score?: number;
}

export interface GoalUpdate {
  id: string;
  learner_id?: string;
  week_of?: string;
  target_minutes?: number;
  note?: string;
}

// Legacy aliases for backward compatibility
export type Course = CourseBlueprint;
export type Class = Record<string, unknown>;
export type StudentProfile = LearnerProfile;
export type Tag = Record<string, unknown>;
export type Message = MessageThread;

interface DawnDataState {
  // LearnPlay manifest entities
  learnerProfiles: LearnerProfile[];
  assignments: Assignment[];
  courseBlueprints: CourseBlueprint[];
  messageThreads: MessageThread[];
  jobTickets: JobTicket[];
  sessionEvents: SessionEvent[];
  goalUpdates: GoalUpdate[];
  // Legacy aliases
  courses: CourseBlueprint[];
  classes: Record<string, unknown>[];
  studentProfiles: LearnerProfile[];
  tags: Record<string, unknown>[];
  messages: MessageThread[];
  loading: boolean;
  error: string | null;
}

interface DawnDataContextValue extends DawnDataState {
  refresh: () => Promise<void>;
  refreshEntity: (entity: string) => Promise<void>;
  saveEntity: (entity: string, values: Record<string, unknown>) => Promise<void>;
  enqueueJob: (jobType: string, payload: Record<string, unknown>) => Promise<void>;
}

const DawnDataContext = createContext<DawnDataContextValue | null>(null);

// Entity slug mapping from manifest
const ENTITY_SLUGS = {
  learnerProfile: "learner-profile",
  assignment: "assignment",
  courseBlueprint: "course-blueprint",
  messageThread: "message-thread",
  jobTicket: "job-ticket",
  sessionEvent: "session-event",
  goalUpdate: "goal-update",
} as const;

export function DawnDataProvider({ children }: { children: React.ReactNode }) {
  const mcp = useMCP();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<DawnDataState>({
    // Primary manifest entities
    learnerProfiles: [],
    assignments: [],
    courseBlueprints: [],
    messageThreads: [],
    jobTickets: [],
    sessionEvents: [],
    goalUpdates: [],
    // Legacy aliases
    courses: [],
    classes: [],
    studentProfiles: [],
    tags: [],
    messages: [],
    loading: true,
    error: null,
  });

  const fetchEntity = useCallback(async (entity: string) => {
    // Don't fetch if auth is still loading
    if (authLoading) {
      return [];
    }
    
    // Don't fetch if user is not authenticated
    if (!user) {
      return [];
    }
    
    try {
      const result = await mcp.listRecords(entity, 100) as { records?: { id: string; data?: Record<string, unknown> }[] } | null;
      return (result?.records || []).map((r) => ({
        id: r.id,
        ...r.data,
      }));
    } catch (err) {
      // Silently handle 401 errors (user not authenticated) - don't log as runtime error
      const error = err as any;
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED' || 
          (error?.message && error.message.includes('Unauthorized'))) {
        return [];
      }
      console.error(`Failed to fetch ${entity}:`, err);
      return [];
    }
  }, [mcp, user, authLoading]);

  const refresh = useCallback(async () => {
    // Don't fetch if auth is still loading or user is not authenticated
    if (authLoading || !user) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // Fetch all manifest entities
      const [
        learnerProfiles,
        assignments,
        courseBlueprints,
        messageThreads,
        jobTickets,
        sessionEvents,
        goalUpdates,
      ] = await Promise.all([
        fetchEntity(ENTITY_SLUGS.learnerProfile),
        fetchEntity(ENTITY_SLUGS.assignment),
        fetchEntity(ENTITY_SLUGS.courseBlueprint),
        fetchEntity(ENTITY_SLUGS.messageThread),
        fetchEntity(ENTITY_SLUGS.jobTicket),
        fetchEntity(ENTITY_SLUGS.sessionEvent),
        fetchEntity(ENTITY_SLUGS.goalUpdate),
      ]);

      setState({
        // Primary manifest entities
        learnerProfiles: learnerProfiles as LearnerProfile[],
        assignments: assignments as Assignment[],
        courseBlueprints: courseBlueprints as CourseBlueprint[],
        messageThreads: messageThreads as MessageThread[],
        jobTickets: jobTickets as JobTicket[],
        sessionEvents: sessionEvents as SessionEvent[],
        goalUpdates: goalUpdates as GoalUpdate[],
        // Legacy aliases (for backward compatibility)
        courses: courseBlueprints as CourseBlueprint[],
        classes: [],
        studentProfiles: learnerProfiles as LearnerProfile[],
        tags: [],
        messages: messageThreads as MessageThread[],
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(s => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [fetchEntity]);

  const refreshEntity = useCallback(async (entity: string) => {
    const data = await fetchEntity(entity);
    // Map entity slug to state key
    const stateKey = {
      "learner-profile": "learnerProfiles",
      "assignment": "assignments",
      "course-blueprint": "courseBlueprints",
      "message-thread": "messageThreads",
      "job-ticket": "jobTickets",
      "session-event": "sessionEvents",
      "goal-update": "goalUpdates",
      // Legacy mappings
      "course": "courses",
      "class": "classes",
      "student-profile": "studentProfiles",
      "tag": "tags",
      "message": "messages",
    }[entity];

    if (stateKey) {
      setState(s => ({ ...s, [stateKey]: data }));
    }
  }, [fetchEntity]);

  const saveEntity = useCallback(async (entity: string, values: Record<string, unknown>) => {
    await mcp.saveRecord(entity, values);
    await refreshEntity(entity);
  }, [mcp, refreshEntity]);

  const enqueueJob = useCallback(async (jobType: string, payload: Record<string, unknown>) => {
    await mcp.enqueueJob(jobType, payload);
    // Refresh job tickets to see the new job
    await refreshEntity("job-ticket");
  }, [mcp, refreshEntity]);

  // Initial load - wait for auth before fetching
  useEffect(() => {
    // Don't fetch until auth is resolved
    if (authLoading) {
      return;
    }
    
    // If user is not authenticated, don't fetch and just set loading to false
    if (!user) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    
    // Wrap in try-catch to prevent crashes in preview/iframe environments
    const safeRefresh = async () => {
      try {
        await refresh();
      } catch (err) {
        console.warn('[DawnDataProvider] Initial load failed, continuing with empty state:', err);
        setState(s => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Initial load failed',
        }));
      }
    };
    safeRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  return (
    <DawnDataContext.Provider value={{
      ...state,
      refresh,
      refreshEntity,
      saveEntity,
      enqueueJob,
    }}>
      {children}
    </DawnDataContext.Provider>
  );
}

export function useDawnData() {
  const context = useContext(DawnDataContext);
  if (!context) {
    throw new Error("useDawnData must be used within a DawnDataProvider");
  }
  return context;
}


