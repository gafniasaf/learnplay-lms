import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
// supabase import removed - not used directly
import { JOB_MODES } from '@/lib/contracts';
import { callEdgeFunctionGet } from '@/lib/api/common';
import { getRuntimeConfigSync } from '@/lib/runtimeConfig';
import { isDevAgentMode } from '@/lib/api/common';
import type {
  SaveRecordResponse,
  GetRecordResponse,
  ListRecordsResponse,
  ListJobsResponse,
  ListCourseJobsResponse,
  GetJobResponse,
  GetStudentSkillsResponse,
  GetClassKOSummaryResponse,
  UpdateMasteryResponse,
  GetDomainGrowthResponse,
  GetRecommendedCoursesResponse,
  GetAutoAssignSettingsResponse,
  StudentGoalsResponse,
  StudentAchievementsResponse,
  ParentChildrenResponse,
  ParentGoalsResponse,
  ParentSubjectsResponse,
  ParentTimelineResponse,
  ParentTopicsResponse,
  ListClassesResponse,
  GetClassRosterResponse,
  ListConversationsResponse,
  ListMessagesResponse,
  ListMediaJobsResponse,
  ListAssignmentsResponse,
  GetAssignmentProgressResponse,
  GetCourseResponse,
  SearchCoursesResponse,
  GetClassProgressResponse,
  GetAnalyticsResponse,
  ListStudentsResponse,
  GetOrgConfigResponse,
  SchoolDashboardSummaryResponse,
  Assignment,
} from '@/lib/types/edge-functions';
import type { StudentTimelineResponse as StudentTimelineUiResponse } from "@/lib/api/studentTimeline";

// IgniteZero: mock mode is forbidden (fail loudly if anyone tries to enable it).
const MOCK_MODE_REQUESTED =
  import.meta.env.VITE_USE_MOCK === "true" || import.meta.env.VITE_USE_MOCK === "1";
if (MOCK_MODE_REQUESTED) {
  throw new Error(
    "❌ MOCK MODE FORBIDDEN: VITE_USE_MOCK is not supported. Remove mock responses and implement missing backend Edge functions instead."
  );
}

function shouldUseMCPProxy(): boolean {
  // Runtime config wins (Lovable preview / deployed environments without env injection)
  const apiMode = getRuntimeConfigSync()?.apiMode;
  if (apiMode === 'mcp') return true;
  if (apiMode === 'edge') return false;

  // Otherwise fall back to explicit env flag (local dev only)
  return import.meta.env.VITE_USE_MCP_PROXY === 'true' || import.meta.env.VITE_USE_MCP_PROXY === '1';
}



interface MCPResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Check if user is authenticated before making API calls
 * Returns the access token if authenticated, null otherwise
 */
async function checkAuth(): Promise<string | null> {
  try {
    const { getAccessToken } = await import('@/lib/supabase');
    return await getAccessToken();
  } catch {
    return null;
  }
}

export function useMCP() {
  const [loading, setLoading] = useState(false);
  // Keep loading readable without making the returned object identity change on every request.
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Call Supabase Edge Function via common helper (uses improved error handling)
  const callEdgeFunction = async <T = unknown>(
    functionName: string,
    body: Record<string, unknown>,
    options?: { maxRetries?: number; timeoutMs?: number; idempotencyKey?: string }
  ): Promise<T> => {
    // Use the common helper which has improved error handling, CORS detection, and auth retry logic
    const { callEdgeFunction: callEdgeFn } = await import('@/lib/api/common');
    return callEdgeFn<Record<string, unknown>, T>(functionName, body, options);
  };

  // Call MCP proxy (for local development only)
  const callMCP = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    const mcpBaseUrl = import.meta.env.VITE_MCP_BASE_URL as string | undefined;
    const mcpToken = import.meta.env.VITE_MCP_AUTH_TOKEN as string | undefined;

    if (!mcpBaseUrl) {
      throw new Error('❌ BLOCKED: VITE_MCP_BASE_URL is REQUIRED when apiMode=mcp (or VITE_USE_MCP_PROXY=true)');
    }
    if (!mcpToken) {
      throw new Error('❌ BLOCKED: VITE_MCP_AUTH_TOKEN is REQUIRED when apiMode=mcp (or VITE_USE_MCP_PROXY=true)');
    }
    
    const response = await fetch(mcpBaseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mcpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: MCPResponse<T> = await response.json();
    
    if (data.error) {
      throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
    }

    return data.result as T;
  };

  interface EnqueueJobResult {
    ok: boolean;
    jobId?: string;
    error?: string;
  }

  const enqueueJob = async (jobType: string, payload: Record<string, unknown> = {}): Promise<EnqueueJobResult> => {
    setLoading(true);
    try {
      if (shouldUseMCPProxy()) {
        return await callMCP<EnqueueJobResult>('lms.enqueueJob', { jobType, payload });
      }

      // Check execution mode from manifest contract
      const mode = (JOB_MODES as Record<string, string | undefined>)[jobType];
      
      if (mode === 'synchronous') {
        // Bypass queue, call runner directly (Live Pipeline)
        return await callEdgeFunction<EnqueueJobResult>('ai-job-runner', { jobType, payload });
      }

      // Default: Async queue (Factory Pipeline)
      // Use an idempotency key so transient network retries won't double-enqueue.
      // This is especially important in Lovable preview where connections can drop mid-request.
      const idempotencyKey = crypto.randomUUID();
      console.log('[enqueueJob] Starting request with idempotencyKey:', idempotencyKey);
      const result = await callEdgeFunction<EnqueueJobResult>(
        'enqueue-job',
        { jobType, payload },
        // With idempotency, we can safely retry more aggressively for preview stability.
        // Increase timeout to 60s for slow Lovable preview environments.
        { maxRetries: 5, idempotencyKey, timeoutMs: 60000 }
      );
      console.log('[enqueueJob] Success:', result);

      // Dev/Preview safety net:
      // In some environments (Lovable iframe), there may be no separate queue worker to process pending jobs.
      // If dev-agent mode is enabled and we just queued ai_course_generate, immediately kick generation by
      // calling the job-aware `generate-course` endpoint (it updates job progress/status and persists output).
      if (result?.ok && result.jobId && jobType === "ai_course_generate" && isDevAgentMode()) {
        const jobId = result.jobId;
        const p: any = payload ?? {};
        const generateBody: Record<string, unknown> = {
          subject: typeof p.subject === "string" ? p.subject : "",
          title: typeof p.title === "string" ? p.title : undefined,
          gradeBand: typeof p.grade_band === "string" ? p.grade_band : (typeof p.gradeBand === "string" ? p.gradeBand : (typeof p.grade === "string" ? p.grade : "All Grades")),
          grade: typeof p.grade === "string" ? p.grade : null,
          itemsPerGroup: typeof p.items_per_group === "number" ? p.items_per_group : (typeof p.itemsPerGroup === "number" ? p.itemsPerGroup : 12),
          mode: p.mode === "numeric" ? "numeric" : "options",
          levelsCount: typeof p.levels_count === "number" ? p.levels_count : (typeof p.levelsCount === "number" ? p.levelsCount : undefined),
        };

        // Fire-and-forget so the UI can immediately start polling job status.
        void callEdgeFunction("generate-course?jobId=" + encodeURIComponent(jobId), generateBody, { timeoutMs: 600000, maxRetries: 0 })
          .then((resp: any) => {
            if (resp?.success === false) {
              console.warn("[enqueueJob] generate-course failed quickly", { jobId, error: resp?.error });
              return;
            }
            console.log("[enqueueJob] generate-course kicked for jobId:", jobId);
          })
          .catch((e) => console.warn("[enqueueJob] generate-course kick failed:", e));
      }

      return result;
    } catch (error: unknown) {
      console.error('[enqueueJob] Error caught:', error);
      // Improve error messages for authentication issues
      const errorObj = error as { status?: number; code?: string; message?: string; details?: { message?: string } };
      if (errorObj?.status === 401 || errorObj?.code === 'UNAUTHORIZED' || errorObj?.code === 'SESSION_STALE' || (errorObj?.message || '').includes('401') || (errorObj?.message || '').includes('Unauthorized')) {
        const errorMessage = errorObj?.message || errorObj?.details?.message || '';
        
        // Check for stale session / missing organization_id error
        if (errorMessage.includes('missing organization_id') || 
            errorMessage.includes('not configured') || 
            errorMessage.includes("doesn't include organization") ||
            errorMessage.includes('SESSION_STALE') ||
            (error && typeof error === 'object' && 'code' in error && error.code === 'SESSION_STALE')) {
          throw new Error(
            'Your session token is stale and doesn\'t include your organization configuration. ' +
            'Please log out completely and log back in to refresh your session token. ' +
            'Your account is configured correctly, but you need a fresh login to activate it.'
          );
        }
        
        const isLovablePreview = typeof window !== 'undefined' && (
          window.location.hostname.includes('lovable.app') || 
          window.location.hostname.includes('lovableproject.com') ||
          window.location.hostname.includes('lovable')
        );
        
        let message = 'Authentication required. Please log in to enqueue jobs.';
        if (isLovablePreview) {
          message = 'Authentication required. Please log in to use this feature in preview environments.';
        } else if (errorMessage) {
          // Use the specific error message from the API if available
          message = errorMessage;
        }
        
        throw new Error(message);
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const saveRecord = async (entity: string, values: Record<string, unknown>) => {
    setLoading(true);
    try {
      if (shouldUseMCPProxy()) {
        return await callMCP('lms.saveRecord', { entity, values });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<SaveRecordResponse>('save-record', { entity, values });
    } finally {
      setLoading(false);
    }
  };

  const getRecord = async (entity: string, id: string) => {
    setLoading(true);
    try {
      if (shouldUseMCPProxy()) {
        return await callMCP('lms.getRecord', { entity, id });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<GetRecordResponse>('get-record', { entity, id });
    } finally {
      setLoading(false);
    }
  };

  const listRecords = async (entity: string, limit = 20) => {
    setLoading(true);
    try {
      if (shouldUseMCPProxy()) {
        return await callMCP<ListRecordsResponse>('lms.listRecords', { entity, limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<ListRecordsResponse>('list-records', { entity, limit });
    } catch (err) {
      // Fail loudly - auth issues must be visible in UI (no silent empty lists).
      const error = err as any;
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
        throw new Error('Authentication required. Please sign in.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const listJobs = async (limit = 20) => {
    setLoading(true);
    try {
      if (shouldUseMCPProxy()) {
        return await callMCP<ListJobsResponse>('lms.listJobs', { limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<ListJobsResponse>('list-jobs', { limit });
    } finally {
      setLoading(false);
    }
  };

  // List course jobs (IgniteZero compliant)
  // NOTE: This must be referentially stable because polling hooks depend on it.
  const listCourseJobs = useCallback(
    async (params: { status?: string; sinceHours?: number; limit?: number; search?: string } = {}) => {
      setLoading(true);
      try {
        const queryParams: Record<string, string> = {};
        if (params.status) queryParams.status = params.status;
        if (params.sinceHours !== undefined) queryParams.sinceHours = String(params.sinceHours);
        if (params.limit !== undefined) queryParams.limit = String(params.limit);
        if (params.search) queryParams.search = params.search;
        return await callEdgeFunctionGet<ListCourseJobsResponse>('list-course-jobs', queryParams);
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  // Get single course job
  // NOTE: This must be referentially stable because polling hooks depend on it.
  const getCourseJob = useCallback(
    async (jobId: string, includeEvents = false) => {
      setLoading(true);
      try {
        return await callEdgeFunctionGet<GetJobResponse>('get-course-job', {
          id: jobId,
          includeEvents: includeEvents ? 'true' : 'false',
        });
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  // Requeue a job
  const requeueJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs') => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean; message: string }>('requeue-job', { jobId, jobTable });
    } finally {
      setLoading(false);
    }
  };

  // Delete a job
  const deleteJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs') => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean; message: string }>('delete-job', { jobId, jobTable });
    } finally {
      setLoading(false);
    }
  };

  // Get job metrics
  const getJobMetrics = async (sinceHours = 24) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<{ ok: boolean; courseJobs: Record<string, any>; mediaJobs: Record<string, any> }>(
        "get-job-metrics",
        { sinceHours: String(sinceHours) }
      );
    } finally {
      setLoading(false);
    }
  };

  // Generic call method (GET)
  const callGet = async <T = unknown>(method: string, params: Record<string, string> = {}): Promise<T> => {
    setLoading(true);
    try {
      // Pre-flight auth check for non-local
      if (!shouldUseMCPProxy()) {
        const token = await checkAuth();
        if (!token) {
          // Return empty result for unauthenticated requests
          return { ok: false, error: 'Not authenticated' } as T;
        }
      }
      
      if (shouldUseMCPProxy()) {
        // MCP protocol doesn't strictly distinguish GET/POST at transport, 
        // but we map it to our internal proxy helper
        return await callMCP<T>(method, params);
      }

      // Map MCP method names to Edge Function names
      // Handle kebab-case method names (e.g., 'lms.student-dashboard' -> 'student-dashboard')
      let functionName = method.replace('lms.', '');
      // Only apply camelCase to kebab-case conversion if there are uppercase letters
      // Otherwise, keep kebab-case as-is
      if (/[A-Z]/.test(functionName)) {
        functionName = functionName.replace(/([A-Z])/g, '-$1').toLowerCase();
      } else {
        functionName = functionName.toLowerCase();
      }
      return await callEdgeFunctionGet<T>(functionName, params);
    } catch (err) {
      const error = err as any;
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
        return { ok: false, error: 'Not authenticated' } as T;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Generic call method (POST)
  const call = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    setLoading(true);
    try {
      // Pre-flight auth check for non-local
      if (!shouldUseMCPProxy()) {
        const token = await checkAuth();
        if (!token) {
          return { ok: false, error: 'Not authenticated' } as T;
        }
      }

      if (shouldUseMCPProxy()) {
        return await callMCP<T>(method, params);
      }
      // Map MCP method names to Edge Function names
      const methodMap: Record<string, string> = {
        'lms.enqueueJob': 'enqueue-job',
        'lms.saveRecord': 'save-record',
        'lms.getRecord': 'get-record',
        'lms.listRecords': 'list-records',
        'lms.listJobs': 'list-jobs',
        'lms.getJob': 'get-job',
        'lms.listCourseJobs': 'list-course-jobs',
        'lms.getCourseJob': 'get-course-job',
        'lms.requeueJob': 'requeue-job',
        'lms.deleteJob': 'delete-job',
        'lms.getJobMetrics': 'get-job-metrics',
      };
      const functionName = methodMap[method] || method.replace('lms.', '').replace(/([A-Z])/g, '-$1').toLowerCase();
      return await callEdgeFunction<T>(functionName, params);
    } catch (err) {
      const error = err as any;
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
        return { ok: false, error: 'Not authenticated' } as T;
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Game session methods
  const startGameRound = async (courseId: string, level: number, assignmentId?: string, contentVersion?: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ sessionId: string; roundId: string; startedAt: string }>('game-start-round', {
        courseId,
        level,
        assignmentId,
        contentVersion,
      });
    } finally {
      setLoading(false);
    }
  };

  const logGameAttempt = async (
    roundId: string,
    itemId: number,
    isCorrect: boolean,
    latencyMs: number,
    finalize = false,
    selectedIndex?: number,
    itemKey?: string,
    idempotencyKey?: string
  ) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ attemptId: string; roundId: string; final?: { finalScore: number; endedAt: string } }>(
        'game-log-attempt',
        {
          roundId,
          itemId,
          isCorrect,
          latencyMs,
          finalize,
          selectedIndex,
          itemKey,
          idempotencyKey,
        }
      );
    } finally {
      setLoading(false);
    }
  };

  const getAnalytics = async (courseId: string, range: '7' | '30' | '90' = '7') => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<{
        dailyData: Array<{ date: string; sessions: number; attempts: number; accuracy: number }>;
        summary: { totalSessions: number; totalAttempts: number; overallAccuracy: number };
        topStudents: Array<{ userId: string; name: string; sessions: number; totalScore: number; accuracy: number }>;
      }>(`get-analytics?courseId=${courseId}&range=${range}`);
    } finally {
      setLoading(false);
    }
  };

  // Knowledge Map methods
  const getStudentSkills = async (params: {
    studentId: string;
    domain?: string;
    status?: 'all' | 'locked' | 'in-progress' | 'mastered';
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<GetStudentSkillsResponse>('get-student-skills', params);
    } finally {
      setLoading(false);
    }
  };

  const getClassKOSummary = async (params: {
    teacherId: string;
    classId?: string;
    sortBy?: 'struggling' | 'mastery' | 'name';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<GetClassKOSummaryResponse>('get-class-ko-summary', params);
    } finally {
      setLoading(false);
    }
  };

  const updateMastery = async (params: {
    studentId: string;
    koId: string;
    exerciseScore: number;
    weight?: number;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<UpdateMasteryResponse>('update-mastery', params);
    } finally {
      setLoading(false);
    }
  };

  const getDomainGrowth = async (studentId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<GetDomainGrowthResponse>('get-domain-growth', { studentId });
    } finally {
      setLoading(false);
    }
  };

  const getRecommendedCourses = async (koId: string, studentId: string, limit?: number) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = { koId, studentId };
      if (limit !== undefined) queryParams.limit = String(limit);
      return await callEdgeFunctionGet<GetRecommendedCoursesResponse>("get-recommended-courses", queryParams);
    } finally {
      setLoading(false);
    }
  };

  const getAutoAssignSettings = async (studentId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<GetAutoAssignSettingsResponse | null>("get-auto-assign-settings", { studentId });
    } finally {
      setLoading(false);
    }
  };

  const updateAutoAssignSettings = async (studentId: string, settings: Record<string, unknown>) => {
    setLoading(true);
    try {
      return await callEdgeFunction<GetAutoAssignSettingsResponse>('update-auto-assign-settings', { studentId, settings });
    } finally {
      setLoading(false);
    }
  };

  const getStudentAssignments = async (params: {
    studentId: string;
    status?: 'active' | 'completed' | 'overdue' | 'all';
    limit?: number;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<Array<Assignment>>('get-student-assignments', params);
    } finally {
      setLoading(false);
    }
  };

  const createAssignment = async (params: {
    studentIds: string[];
    koId: string;
    courseId: string;
    assignedBy: string;
    assignedByRole: 'teacher' | 'parent' | 'ai_autonomous';
    completionCriteria: Record<string, unknown>;
    llmRationale?: string;
    llmConfidence?: number;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ assignmentIds: string[]; success: boolean }>('create-assignment', params);
    } finally {
      setLoading(false);
    }
  };

  // Student API methods
  const getStudentGoals = async (params?: { studentId?: string; status?: string }) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {};
      if (params?.studentId) queryParams.studentId = params.studentId;
      if (params?.status) queryParams.status = params.status;
      return await callEdgeFunctionGet<StudentGoalsResponse>("student-goals", queryParams);
    } finally {
      setLoading(false);
    }
  };

  const updateStudentGoal = async (goalId: string, updates: { progress_minutes?: number; status?: string; teacher_note?: string }) => {
    setLoading(true);
    try {
      // Use direct fetch for PATCH since callEdgeFunction only supports POST
      const { getAccessToken } = await import("@/integrations/supabase/client");
      const supabaseUrl = (await import("@/lib/api/common")).getSupabaseUrl();
      const anonKey = (await import("@/lib/api/common")).getSupabaseAnonKey();
      const token = await getAccessToken();
      const authHeader = token ? `Bearer ${token}` : `Bearer ${anonKey}`;
      const url = `${supabaseUrl}/functions/v1/student-goals/${goalId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
          apikey: anonKey,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to update goal');
      }
      return await res.json();
    } finally {
      setLoading(false);
    }
  };

  const getStudentTimeline = async (params?: { studentId?: string; limit?: number; cursor?: string }) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {};
      if (params?.studentId) queryParams.studentId = params.studentId;
      if (params?.limit !== undefined) queryParams.limit = String(params.limit);
      if (params?.cursor) queryParams.cursor = params.cursor;

      type EdgeEvent = {
        id: string;
        student_id: string;
        event_type: string;
        description: string;
        metadata: Record<string, any> | null;
        occurred_at: string;
      };
      type EdgeResponse = { events: EdgeEvent[]; nextCursor: string | null; hasMore: boolean };

      const resp = await callEdgeFunctionGet<EdgeResponse>("student-timeline", queryParams);

      return {
        events: Array.isArray(resp?.events)
          ? resp.events.map((e) => ({
              id: e.id,
              studentId: e.student_id,
              eventType: e.event_type,
              description: e.description,
              metadata: e.metadata ?? {},
              occurredAt: e.occurred_at,
            }))
          : [],
        nextCursor: resp?.nextCursor ?? null,
        hasMore: Boolean(resp?.hasMore),
      } satisfies StudentTimelineUiResponse;
    } finally {
      setLoading(false);
    }
  };

  const getStudentAchievements = async (studentId?: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<StudentAchievementsResponse>(
        "student-achievements",
        studentId ? { studentId } : undefined
      );
    } finally {
      setLoading(false);
    }
  };

  // Parent API methods
  const getParentDashboard = async (parentId?: string) => {
    setLoading(true);
    try {
      // Per NO-FALLBACK policy: parentId is required, fail explicitly if missing
      if (!parentId) {
        throw new Error("parentId is required for parent-dashboard - no anonymous access");
      }
      return await callEdgeFunctionGet<import('@/lib/types/edge-functions').ParentDashboardResponse>(
        "parent-dashboard",
        { parentId }
      );
    } finally {
      setLoading(false);
    }
  };

  const getParentChildren = async (parentId?: string) => {
    setLoading(true);
    try {
      // Per NO-FALLBACK policy: parentId is required, fail explicitly if missing
      if (!parentId) {
        throw new Error("parentId is required for parent-children - no anonymous access");
      }
      return await callEdgeFunctionGet<ParentChildrenResponse>("parent-children", { parentId });
    } finally {
      setLoading(false);
    }
  };

  const getParentGoals = async (childId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ParentGoalsResponse>("parent-goals", { childId });
    } finally {
      setLoading(false);
    }
  };

  const getParentSubjects = async (childId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ParentSubjectsResponse>("parent-subjects", { childId });
    } finally {
      setLoading(false);
    }
  };

  const getParentTimeline = async (childId: string, limit?: number) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = { childId };
      if (limit !== undefined) queryParams.limit = String(limit);
      return await callEdgeFunctionGet<ParentTimelineResponse>("parent-timeline", queryParams);
    } finally {
      setLoading(false);
    }
  };

  const getParentTopics = async (childId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ParentTopicsResponse>("parent-topics", { childId });
    } finally {
      setLoading(false);
    }
  };

  // Class Management methods
  const listClasses = async () => {
    setLoading(true);
    try {
      // Pre-flight auth check
      const token = await checkAuth();
      if (!token) {
        return { classes: [] };
      }
      
      return await callEdgeFunctionGet<ListClassesResponse>('list-classes');
    } catch (err) {
      const error = err as any;
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED') {
        return { classes: [] };
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getClassRoster = async (classId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<GetClassRosterResponse>("get-class-roster", { classId });
    } finally {
      setLoading(false);
    }
  };

  const createClass = async (name: string, description?: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ class: { id: string; name: string; description?: string; owner: string; created_at: string } }>('create-class', { name, description });
    } finally {
      setLoading(false);
    }
  };

  const addClassMember = async (classId: string, studentEmail: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean }>('add-class-member', { classId, studentEmail });
    } finally {
      setLoading(false);
    }
  };

  const removeClassMember = async (classId: string, studentId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean }>('remove-class-member', { classId, studentId });
    } finally {
      setLoading(false);
    }
  };

  const inviteStudent = async (orgId: string, classId: string, email: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ inviteId: string; success: boolean }>('invite-student', { orgId, classId, email });
    } finally {
      setLoading(false);
    }
  };

  const generateClassCode = async (classId: string, refreshCode?: boolean) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ code: string; expiresAt: string }>('generate-class-code', { classId, refreshCode });
    } finally {
      setLoading(false);
    }
  };

  const joinClass = async (code: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ success: boolean; classId?: string }>('join-class', { code: code.toUpperCase() });
    } finally {
      setLoading(false);
    }
  };

  const createChildCode = async (studentId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ code: string; expiresAt: string }>('create-child-code', { studentId });
    } finally {
      setLoading(false);
    }
  };

  const linkChild = async (code: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ success: boolean; childId?: string }>('link-child', { code });
    } finally {
      setLoading(false);
    }
  };

  // Messaging methods
  const sendMessage = async (recipientId: string, content: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ messageId: string; success: boolean }>('send-message', { recipientId, content });
    } finally {
      setLoading(false);
    }
  };

  const listConversations = async () => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ListConversationsResponse>('list-conversations');
    } finally {
      setLoading(false);
    }
  };

  const listMessages = async (conversationWith?: string, limit?: number) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {};
      if (conversationWith) queryParams.conversationWith = conversationWith;
      if (limit !== undefined) queryParams.limit = String(limit);
      return await callEdgeFunctionGet<ListMessagesResponse>("list-messages", queryParams);
    } finally {
      setLoading(false);
    }
  };

  // Job Management Methods (additional)
  const listMediaJobsFiltered = async (params: {
    courseId?: string;
    status?: string;
    limit?: number;
  }) => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = {};
      if (params.courseId) queryParams.courseId = params.courseId;
      if (params.status) queryParams.status = params.status;
      if (params.limit !== undefined) queryParams.limit = String(params.limit);
      return await callEdgeFunctionGet<ListMediaJobsResponse>("list-media-jobs", queryParams);
    } finally {
      setLoading(false);
    }
  };

  // Assignment Methods
  const listAssignmentsForTeacher = async () => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ListAssignmentsResponse>('list-assignments');
    } finally {
      setLoading(false);
    }
  };

  const listAssignmentsForStudent = async () => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ListAssignmentsResponse>('list-assignments-student');
    } finally {
      setLoading(false);
    }
  };

  const createAssignmentForCourse = async (params: {
    courseId: string;
    title?: string;
    dueAt?: string;
    assignees: Array<{ type: string; classId?: string; userId?: string }>;
  }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ assignmentId: string; message: string }>('create-assignment', params);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentProgress = async (assignmentId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<GetAssignmentProgressResponse>("get-assignment-progress", { assignmentId });
    } finally {
      setLoading(false);
    }
  };

  const exportGradebook = async (assignmentId: string): Promise<Blob> => {
    setLoading(true);
    try {
      // export-gradebook returns raw CSV, not JSON
      const { exportGradebook: exportGradebookBlob } = await import("@/lib/api/assignments");
      return await exportGradebookBlob(assignmentId);
    } finally {
      setLoading(false);
    }
  };

  // Course Management Methods
  const getCourse = async (courseId: string) => {
    setLoading(true);
    try {
      // get-course reads from Storage; allow a bit more time in preview environments.
      const payload = await callEdgeFunctionGet<any>("get-course", { courseId }, { timeoutMs: 60000, maxRetries: 1 });

      // Dawn parity: accept envelope { format, content } and unwrap consistently.
      const isEnvelope =
        payload && typeof payload === "object" && "content" in payload && "format" in payload;
      const format = isEnvelope ? String((payload as any).format ?? "practice") : "practice";
      const course = (isEnvelope ? (payload as any).content : payload) as any;

      if (format !== "practice") {
        throw new Error(
          `Unsupported course format '${format}'. This course is stored correctly, but Play/Editor currently only support 'practice'.`
        );
      }

      if (!course || typeof course !== "object" || !Array.isArray(course.items)) {
        throw new Error(
          `Course '${courseId}' is not playable yet (missing items[]). Delete or regenerate this course.`
        );
      }

      // Attach envelope metadata for future format-aware UIs.
      (course as any)._metadata = { format, envelope: isEnvelope ? payload : undefined };

      return course as GetCourseResponse;
    } finally {
      setLoading(false);
    }
  };

  const getCourseCatalog = async () => {
    setLoading(true);
    try {
      // Fetch from list-courses Edge Function (not static file)
      // This ensures we only show courses that exist in the database
      console.log('[MCP] getCourseCatalog - fetching from Edge Function');
      const response = await callEdgeFunctionGet<{ items: Array<{ id: string; title?: string; subject?: string; grade?: string; contentVersion?: string; itemCount?: number }> }>('list-courses');
      const items = response?.items || [];
      
      // Transform to catalog format
      const courses = items.map(item => ({
        id: item.id,
        title: item.title || item.id,
        subject: item.subject || 'General',
        gradeBand: item.grade || 'All Grades',
        contentVersion: item.contentVersion || '',
        description: `Interactive course: ${item.title || item.id}`,
        itemCount: item.itemCount || 0,
        duration: '15 min',
        difficulty: 'Intermediate',
      }));
      
      console.log('[MCP] getCourseCatalog - loaded', courses.length, 'courses from Edge Function');
      return { courses, subjects: [] };
    } catch (error) {
      console.error('[MCP] getCourseCatalog - failed:', error);
      // Return empty catalog on error - don't use static fallback with demo courses
      return { courses: [], subjects: [] };
    } finally {
      setLoading(false);
    }
  };

  const searchCourses = async (query: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<SearchCoursesResponse>("search-courses", { query });
    } finally {
      setLoading(false);
    }
  };

  const updateCourse = async (courseId: string, operations: unknown[]) => {
    setLoading(true);
    try {
      // Edge function expects JSON Patch ops under `ops` (not `operations`).
      return await callEdgeFunction<{ ok: boolean; courseId: string }>('update-course', { courseId, ops: operations });
    } finally {
      setLoading(false);
    }
  };

  const publishCourse = async (courseId: string, changelog?: string) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean; courseId: string }>('publish-course', { courseId, changelog });
    } finally {
      setLoading(false);
    }
  };

  const restoreCourseVersion = async (courseId: string, version: number) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ ok: boolean; courseId: string; version: number }>('restore-course-version', { courseId, version });
    } finally {
      setLoading(false);
    }
  };

  const getCoursesByTags = async (tags: string[]) => {
    setLoading(true);
    try {
      return await callEdgeFunction<SearchCoursesResponse>('get-courses-by-tags', { tags });
    } finally {
      setLoading(false);
    }
  };

  // Dashboard Methods
  const getDashboard = async (role: string, userId?: string) => {
    setLoading(true);
    try {
      // get-dashboard Edge Function requires teacherId, not role
      // For student/parent dashboards, use dedicated endpoints via useDashboard hook
      if (!userId) {
        console.warn('[useMCP] getDashboard called without userId - use useDashboard hook instead');
        return { summary: {}, data: [] };
      }
      return await callEdgeFunctionGet<import('@/lib/types/edge-functions').TeacherDashboardResponse | import('@/lib/types/dashboard').Dashboard>('get-dashboard', { teacherId: userId });
    } finally {
      setLoading(false);
    }
  };

  const getSchoolDashboardSummary = async () => {
    setLoading(true);
    try {
      // NOTE: We intentionally call the Edge Function directly here to keep dev-agent preview stable.
      // If you later add an MCP handler, you can route this through callMCP when shouldUseMCPProxy() is true.
      return await callEdgeFunctionGet<SchoolDashboardSummaryResponse>("school-dashboard");
    } finally {
      setLoading(false);
    }
  };

  const getClassProgress = async (classId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<GetClassProgressResponse>("get-class-progress", { classId });
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async (courseId: string, range: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<GetAnalyticsResponse>("get-analytics", { courseId, range });
    } finally {
      setLoading(false);
    }
  };

  const listOrgStudents = async () => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<ListStudentsResponse>('list-org-students');
    } finally {
      setLoading(false);
    }
  };

  // Game/Play Methods (legacy)
  const startRound = async (courseId: string, level: number) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ sessionId: string; roundId: string }>('game-start-round', { courseId, level });
    } finally {
      setLoading(false);
    }
  };

  const logAttempt = async (params: unknown) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ attemptId: string }>('game-log-attempt', params as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  // Org Config Methods
  const getOrgConfig = async () => {
    setLoading(true);
    try {
      const resp = await callEdgeFunctionGet<any>('get-org-config');

      // get-org-config returns HTTP 200 even on logical errors (preview safety).
      // Convert those into exceptions so UI can handle gracefully.
      if (resp && typeof resp === 'object' && 'ok' in resp && (resp as any).ok === false) {
        const err = (resp as any).error;
        const code = typeof err?.code === 'string' ? err.code : 'org_config_failed';
        const message =
          code === 'unauthorized'
            ? 'NOT_AUTHENTICATED'
            : (typeof err?.message === 'string' ? err.message : 'Failed to load organization config');
        throw new Error(message);
      }

      return resp as GetOrgConfigResponse;
    } finally {
      setLoading(false);
    }
  };

  // Media Methods
  const uploadMediaFile = async (file: File, path: string) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      
      const { getAccessToken } = await import("@/integrations/supabase/client");
      const supabaseUrl = (await import("@/lib/api/common")).getSupabaseUrl();
      const anonKey = (await import("@/lib/api/common")).getSupabaseAnonKey();
      const token = await getAccessToken();
      const authHeader = token ? `Bearer ${token}` : `Bearer ${anonKey}`;
      
      const res = await fetch(`${supabaseUrl}/functions/v1/upload-media`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          apikey: anonKey,
        },
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(`Upload failed: ${await res.text()}`);
      }
      
      return await res.json();
    } finally {
      setLoading(false);
    }
  };

  const rewriteText = async (request: { segmentType: string; currentText: string; context?: Record<string, unknown>; styleHints?: string[]; candidateCount?: number }) => {
    setLoading(true);
    try {
      return await callEdgeFunction<{ candidates: Array<{ text: string; rationale: string }>; originalText: string; segmentType: string; context: unknown }>('ai-rewrite-text', request);
    } finally {
      setLoading(false);
    }
  };

  // Job Status (for useJobStatus hook)
  const getJobStatus = async (jobId: string) => {
    setLoading(true);
    try {
      return await callEdgeFunctionGet<{ jobId: string; state: string; step: string; progress: number; message?: string }>(
        "job-status",
        { jobId }
      );
    } finally {
      setLoading(false);
    }
  };

  return useMemo(() => ({ 
    call,
    callGet, 
    enqueueJob, 
    saveRecord, 
    getRecord, 
    listJobs, 
    listRecords, 
    // New job methods (IgniteZero)
    listCourseJobs,
    getCourseJob,
    requeueJob,
    deleteJob,
    getJobMetrics,
    // Game session methods
    startGameRound,
    logGameAttempt,
    getAnalytics,
    // Knowledge Map methods
    getStudentSkills,
    getClassKOSummary,
    updateMastery,
    getDomainGrowth,
    getRecommendedCourses,
    getAutoAssignSettings,
    updateAutoAssignSettings,
    getStudentAssignments,
    createAssignment,
    // Student API methods
    getStudentGoals,
    updateStudentGoal,
    getStudentTimeline,
    getStudentAchievements,
    // Parent API methods
    getParentDashboard,
    getParentChildren,
    getParentGoals,
    getParentSubjects,
    getParentTimeline,
    getParentTopics,
    // Class Management methods
    listClasses,
    getClassRoster,
    createClass,
    addClassMember,
    removeClassMember,
    inviteStudent,
    generateClassCode,
    joinClass,
    createChildCode,
    linkChild,
    // Messaging methods
    sendMessage,
    listConversations,
    listMessages,
    // Additional Job Management methods
    listMediaJobsFiltered,
    // Assignment methods
    listAssignmentsForTeacher,
    listAssignmentsForStudent,
    createAssignmentForCourse,
    getAssignmentProgress,
    exportGradebook,
    // Course Management methods
    getCourse,
    getCourseCatalog,
    searchCourses,
    updateCourse,
    publishCourse,
    restoreCourseVersion,
    getCoursesByTags,
    // Dashboard methods
    getDashboard,
    getSchoolDashboardSummary,
    getClassProgress,
    fetchAnalytics,
    listOrgStudents,
    // Game/Play methods (legacy)
    startRound,
    logAttempt,
    // Org Config methods
    getOrgConfig,
    // Media methods
    uploadMediaFile,
    rewriteText,
    // Job Status
    getJobStatus,
    // Expose live loading without changing object identity.
    get loading() {
      return loadingRef.current;
    },
  }), [listCourseJobs, getCourseJob]);
}
