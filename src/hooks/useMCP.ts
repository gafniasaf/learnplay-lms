import { useState } from 'react';
// supabase import removed - not used directly
import { JOB_MODES } from '@/lib/contracts';
import { callEdgeFunctionGet } from '@/lib/api/common';

// MCP Proxy settings (for local development only)
// Per IgniteZero rules: No fallback tokens - require explicit configuration
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL;
const MCP_TOKEN = import.meta.env.VITE_MCP_AUTH_TOKEN; // REQUIRED - no fallback

// Validate MCP configuration when using MCP proxy
if (import.meta.env.VITE_USE_MCP_PROXY === 'true' || import.meta.env.VITE_USE_MCP_PROXY === '1') {
  if (!MCP_BASE_URL) {
    console.error('❌ VITE_MCP_BASE_URL is REQUIRED when VITE_USE_MCP_PROXY=true');
    throw new Error('VITE_MCP_BASE_URL environment variable is required for MCP proxy mode');
  }
  if (!MCP_TOKEN) {
    console.error('❌ VITE_MCP_AUTH_TOKEN is REQUIRED when VITE_USE_MCP_PROXY=true');
    throw new Error('VITE_MCP_AUTH_TOKEN environment variable is required for MCP proxy mode');
  }
}

// Mock mode for E2E testing - returns demo data without network calls
const useMockMode = import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1';

// Determine if we should use MCP proxy (local) or Supabase Edge Functions (production)
// 
// Environment detection logic:
// 1. VITE_USE_MCP_PROXY=true → Use local MCP proxy (for local dev with MCP server running)
// 2. Otherwise → Use Supabase Edge Functions (production, Lovable, or local without MCP)
//
// This defaults to Edge Functions, which is the safer choice for deployed environments.
// Developers who want to use the local MCP proxy should set VITE_USE_MCP_PROXY=true
const useMCPProxy = import.meta.env.VITE_USE_MCP_PROXY === 'true' || import.meta.env.VITE_USE_MCP_PROXY === '1';
const isLocalDev = useMCPProxy;

// Mock data for E2E testing
const MOCK_DATA: Record<string, unknown> = {
  'learner-profile': {
    records: [{
      id: 'mock-1',
      fullName: 'Demo Student',
      currentMinutes: 45,
      weeklyGoalMinutes: 60,
      streakDays: 3,
      totalSessions: 12,
      averageAccuracy: 78,
    }],
  },
  'assignment': {
    records: [{
      id: 'mock-assign-1',
      title: 'Fractions Practice',
      subject: 'Mathematics',
      status: 'in_progress',
    }],
  },
  'course-blueprint': {
    records: [],
  },
  'message-thread': {
    records: [{
      id: 'thread-1',
      title: 'Math Help',
      participant_ids: ['user-1', 'teacher-1'],
      last_message: 'Thanks for the help!',
    }],
  },
  'job-ticket': {
    records: [],
  },
  'session-event': {
    records: [],
  },
  'goal-update': {
    records: [],
  },
};

interface MCPResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export function useMCP() {
  const [loading, setLoading] = useState(false);

  // Call Supabase Edge Function via common helper (uses improved error handling)
  const callEdgeFunction = async <T = unknown>(functionName: string, body: Record<string, unknown>): Promise<T> => {
    // Use the common helper which has improved error handling, CORS detection, and auth retry logic
    const { callEdgeFunction: callEdgeFn } = await import('@/lib/api/common');
    return callEdgeFn<Record<string, unknown>, T>(functionName, body);
  };

  // Call MCP proxy (for local development only)
  const callMCP = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    if (!MCP_BASE_URL) {
      throw new Error('MCP_BASE_URL is not configured. Set VITE_MCP_BASE_URL env var or disable MCP proxy mode.');
    }
    if (!MCP_TOKEN) {
      throw new Error('MCP_AUTH_TOKEN is not configured. Set VITE_MCP_AUTH_TOKEN env var or disable MCP proxy mode.');
    }
    
    const response = await fetch(MCP_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MCP_TOKEN}`,
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
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] enqueueJob:', jobType, payload);
        return { ok: true, jobId: 'mock-job-id' };
      }

      if (isLocalDev) {
        return await callMCP<EnqueueJobResult>('lms.enqueueJob', { jobType, payload });
      }

      // Check execution mode from manifest contract
      const mode = (JOB_MODES as Record<string, string | undefined>)[jobType];
      
      if (mode === 'synchronous') {
        // Bypass queue, call runner directly (Live Pipeline)
        return await callEdgeFunction<EnqueueJobResult>('ai-job-runner', { jobType, payload });
      }

      // Default: Async queue (Factory Pipeline)
      return await callEdgeFunction<EnqueueJobResult>('enqueue-job', { jobType, payload });
    } catch (error: unknown) {
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
        
        // Check if in guest mode
        const isGuestMode = typeof window !== 'undefined' && (() => {
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('guest') === '1') return true;
          try { return localStorage.getItem('guestMode') === 'true'; } catch { return false; }
        })();
        
        const isLovablePreview = typeof window !== 'undefined' && (
          window.location.hostname.includes('lovable.app') || 
          window.location.hostname.includes('lovableproject.com') ||
          window.location.hostname.includes('lovable')
        );
        
        let message = 'Authentication required. Please log in to enqueue jobs.';
        if (isGuestMode) {
          message = 'Job creation requires a full account. Please sign up or log in to create jobs.';
        } else if (isLovablePreview) {
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
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] saveRecord:', entity, values);
        return { ok: true, id: values.id || 'mock-saved-id' };
      }

      if (isLocalDev) {
        return await callMCP('lms.saveRecord', { entity, values });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction('save-record', { entity, values });
    } finally {
      setLoading(false);
    }
  };

  const getRecord = async (entity: string, id: string) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] getRecord:', entity, id);
        const mockRecords = MOCK_DATA[entity] as { records?: unknown[] } | undefined;
        return { record: mockRecords?.records?.[0] || null };
      }

      if (isLocalDev) {
        return await callMCP('lms.getRecord', { entity, id });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction('get-record', { entity, id });
    } finally {
      setLoading(false);
    }
  };

  const listRecords = async (entity: string, limit = 20) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] listRecords:', entity, limit);
        return MOCK_DATA[entity] || { records: [] };
      }

      if (isLocalDev) {
        return await callMCP<{ ok: boolean, records: unknown[] }>('lms.listRecords', { entity, limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<{ ok: boolean, records: unknown[] }>('list-records', { entity, limit });
    } finally {
      setLoading(false);
    }
  };

  const listJobs = async (limit = 20) => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] listJobs:', limit);
        return { jobs: [] };
      }

      if (isLocalDev) {
        return await callMCP<{ jobs: unknown[] }>('lms.listJobs', { limit });
      }
      // Use Supabase Edge Function in production
      return await callEdgeFunction<{ jobs: unknown[] }>('list-jobs', { limit });
    } finally {
      setLoading(false);
    }
  };

  // List course jobs (IgniteZero compliant)
  const listCourseJobs = async (params: { status?: string; sinceHours?: number; limit?: number; search?: string } = {}) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listCourseJobs:', params);
        return { ok: true, jobs: [], total: 0 };
      }
      const queryParams = new URLSearchParams();
      if (params.status) queryParams.set('status', params.status);
      if (params.sinceHours) queryParams.set('sinceHours', String(params.sinceHours));
      if (params.limit) queryParams.set('limit', String(params.limit));
      if (params.search) queryParams.set('search', params.search);
      
      return await callEdgeFunctionGet<{ ok: boolean; jobs: unknown[]; total: number }>(
        `list-course-jobs?${queryParams.toString()}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Get single course job
  const getCourseJob = async (jobId: string, includeEvents = false) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getCourseJob:', jobId);
        return { ok: true, job: null, events: [] };
      }
      return await callEdgeFunctionGet<{ ok: boolean; job: unknown; events: unknown[] }>(
        `get-course-job?id=${jobId}&includeEvents=${includeEvents}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Requeue a job
  const requeueJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs') => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] requeueJob:', jobId, jobTable);
        return { ok: true, message: 'Job requeued (mock)' };
      }
      return await callEdgeFunction<{ ok: boolean; message: string }>('requeue-job', { jobId, jobTable });
    } finally {
      setLoading(false);
    }
  };

  // Delete a job
  const deleteJob = async (jobId: string, jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs') => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] deleteJob:', jobId, jobTable);
        return { ok: true, message: 'Job deleted (mock)' };
      }
      return await callEdgeFunction<{ ok: boolean; message: string }>('delete-job', { jobId, jobTable });
    } finally {
      setLoading(false);
    }
  };

  // Get job metrics
  const getJobMetrics = async (sinceHours = 24) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getJobMetrics:', sinceHours);
        return { ok: true, courseJobs: { total: 0, byStatus: {} }, mediaJobs: { total: 0, byStatus: {} } };
      }
      return await callEdgeFunctionGet<{ ok: boolean; courseJobs: unknown; mediaJobs: unknown }>(
        `get-job-metrics?sinceHours=${sinceHours}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Generic call method (GET)
  const callGet = async <T = unknown>(method: string, params: Record<string, string> = {}): Promise<T> => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] callGet:', method, params);
        return { ok: true } as T;
      }
      
      if (isLocalDev) {
        // MCP protocol doesn't strictly distinguish GET/POST at transport, 
        // but we map it to our internal proxy helper
        return await callMCP<T>(method, params);
      }

      const functionName = method.replace('lms.', '').replace(/([A-Z])/g, '-$1').toLowerCase();
      return await callEdgeFunctionGet<T>(functionName, params);
    } finally {
      setLoading(false);
    }
  };

  // Generic call method (POST)
  const call = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    setLoading(true);
    try {
      // Mock mode for E2E testing
      if (useMockMode) {
        console.log('[MCP Mock] call:', method, params);
        // Handle health check
        if (method === 'health' || method === 'lms.health') {
          return { ok: true, services: { database: true, mcp: true } } as T;
        }
        return { ok: true } as T;
      }

      if (isLocalDev) {
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
    } finally {
      setLoading(false);
    }
  };

  // Game session methods
  const startGameRound = async (courseId: string, level: number, assignmentId?: string, contentVersion?: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] startGameRound:', courseId, level, assignmentId);
        return { sessionId: 'mock-session-id', roundId: 'mock-round-id', startedAt: new Date().toISOString() };
      }
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
      if (useMockMode) {
        console.log('[MCP Mock] logGameAttempt:', roundId, itemId, isCorrect);
        return { attemptId: 'mock-attempt-id', roundId, final: finalize ? { finalScore: 10, endedAt: new Date().toISOString() } : undefined };
      }
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
      if (useMockMode) {
        console.log('[MCP Mock] getAnalytics:', courseId, range);
        return {
          dailyData: [],
          summary: { totalSessions: 0, totalAttempts: 0, overallAccuracy: 0 },
          topStudents: [],
        };
      }
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
      if (useMockMode) {
        console.log('[MCP Mock] getStudentSkills:', params);
        return { skills: [], totalCount: 0 };
      }
      return await callEdgeFunction<{ skills: unknown[]; totalCount: number }>('get-student-skills', params);
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
      if (useMockMode) {
        console.log('[MCP Mock] getClassKOSummary:', params);
        return [];
      }
      return await callEdgeFunction<unknown[]>('get-class-ko-summary', params);
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
      if (useMockMode) {
        console.log('[MCP Mock] updateMastery:', params);
        return { oldMastery: 0, newMastery: params.exerciseScore, evidenceCount: 1 };
      }
      return await callEdgeFunction<{ oldMastery: number; newMastery: number; evidenceCount: number }>('update-mastery', params);
    } finally {
      setLoading(false);
    }
  };

  const getDomainGrowth = async (studentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getDomainGrowth:', studentId);
        return [];
      }
      return await callEdgeFunction<unknown[]>('get-domain-growth', { studentId });
    } finally {
      setLoading(false);
    }
  };

  const getRecommendedCourses = async (koId: string, studentId: string, limit?: number) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getRecommendedCourses:', koId, studentId);
        return [];
      }
      const query = `koId=${koId}&studentId=${studentId}${limit ? `&limit=${limit}` : ''}`;
      return await callEdgeFunctionGet<unknown[]>(`get-recommended-courses?${query}`);
    } finally {
      setLoading(false);
    }
  };

  const getAutoAssignSettings = async (studentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getAutoAssignSettings:', studentId);
        return null;
      }
      return await callEdgeFunctionGet<unknown | null>(`get-auto-assign-settings?studentId=${studentId}`);
    } finally {
      setLoading(false);
    }
  };

  const updateAutoAssignSettings = async (studentId: string, settings: Record<string, unknown>) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] updateAutoAssignSettings:', studentId, settings);
        return { studentId, ...settings, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      }
      return await callEdgeFunction<unknown>('update-auto-assign-settings', { studentId, settings });
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
      if (useMockMode) {
        console.log('[MCP Mock] getStudentAssignments:', params);
        return [];
      }
      return await callEdgeFunction<unknown[]>('get-student-assignments', params);
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
      if (useMockMode) {
        console.log('[MCP Mock] createAssignment:', params);
        return { assignmentIds: params.studentIds.map(id => `assign-${Date.now()}-${id}`), success: true };
      }
      return await callEdgeFunction<{ assignmentIds: string[]; success: boolean }>('create-assignment', params);
    } finally {
      setLoading(false);
    }
  };

  // Student API methods
  const getStudentGoals = async (params?: { studentId?: string; status?: string }) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getStudentGoals:', params);
        return { goals: [], summary: { total: 0, onTrack: 0, behind: 0, completed: 0 } };
      }
      const queryParams = new URLSearchParams();
      if (params?.studentId) queryParams.set('studentId', params.studentId);
      if (params?.status) queryParams.set('status', params.status);
      return await callEdgeFunctionGet<{ goals: unknown[]; summary: { total: number; onTrack: number; behind: number; completed: number } }>(`student-goals?${queryParams}`);
    } finally {
      setLoading(false);
    }
  };

  const updateStudentGoal = async (goalId: string, updates: { progress_minutes?: number; status?: string; teacher_note?: string }) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] updateStudentGoal:', goalId, updates);
        return { id: goalId, ...updates, updated_at: new Date().toISOString() };
      }
      // Use direct fetch for PATCH since callEdgeFunction only supports POST
      const { getAccessToken } = await import("@/lib/supabase");
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
      if (useMockMode) {
        console.log('[MCP Mock] getStudentTimeline:', params);
        return { events: [], nextCursor: null };
      }
      const queryParams = new URLSearchParams();
      if (params?.studentId) queryParams.set('studentId', params.studentId);
      if (params?.limit) queryParams.set('limit', String(params.limit));
      if (params?.cursor) queryParams.set('cursor', params.cursor);
      return await callEdgeFunctionGet<{ events: unknown[]; nextCursor: string | null }>(`student-timeline?${queryParams}`);
    } finally {
      setLoading(false);
    }
  };

  const getStudentAchievements = async (studentId?: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getStudentAchievements:', studentId);
        return { achievements: [], total: 0 };
      }
      const query = studentId ? `?studentId=${studentId}` : '';
      return await callEdgeFunctionGet<{ achievements: unknown[]; total: number }>(`student-achievements${query}`);
    } finally {
      setLoading(false);
    }
  };

  // Parent API methods
  const getParentDashboard = async (parentId?: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentDashboard:', parentId);
        return { children: [], summary: { totalChildren: 0, activeGoals: 0, completedGoals: 0 } };
      }
      const query = parentId ? `?parentId=${parentId}` : '';
      return await callEdgeFunctionGet<unknown>(`parent-dashboard${query}`);
    } finally {
      setLoading(false);
    }
  };

  const getParentChildren = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentChildren');
        return { children: [] };
      }
      return await callEdgeFunctionGet<{ children: unknown[] }>('parent-children');
    } finally {
      setLoading(false);
    }
  };

  const getParentGoals = async (childId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentGoals:', childId);
        return { goals: [], summary: { total: 0, onTrack: 0, behind: 0, completed: 0 } };
      }
      return await callEdgeFunctionGet<{ goals: unknown[]; summary: unknown }>(`parent-goals?childId=${childId}`);
    } finally {
      setLoading(false);
    }
  };

  const getParentSubjects = async (childId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentSubjects:', childId);
        return { subjects: [] };
      }
      return await callEdgeFunctionGet<{ subjects: unknown[] }>(`parent-subjects?childId=${childId}`);
    } finally {
      setLoading(false);
    }
  };

  const getParentTimeline = async (childId: string, limit?: number) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentTimeline:', childId, limit);
        return { events: [], nextCursor: null };
      }
      const query = `childId=${childId}${limit ? `&limit=${limit}` : ''}`;
      return await callEdgeFunctionGet<{ events: unknown[]; nextCursor: string | null }>(`parent-timeline?${query}`);
    } finally {
      setLoading(false);
    }
  };

  const getParentTopics = async (childId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getParentTopics:', childId);
        return { topics: [] };
      }
      return await callEdgeFunctionGet<{ topics: unknown[] }>(`parent-topics?childId=${childId}`);
    } finally {
      setLoading(false);
    }
  };

  // Class Management methods
  const listClasses = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listClasses');
        return { classes: [] };
      }
      return await callEdgeFunctionGet<{ classes: unknown[] }>('list-classes');
    } finally {
      setLoading(false);
    }
  };

  const getClassRoster = async (classId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getClassRoster:', classId);
        return { members: [], pendingInvites: [] };
      }
      return await callEdgeFunctionGet<{ members: unknown[]; pendingInvites: unknown[] }>(`get-class-roster?classId=${classId}`);
    } finally {
      setLoading(false);
    }
  };

  const createClass = async (name: string, description?: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] createClass:', name, description);
        return { class: { id: `class-${Date.now()}`, name, description, owner: 'mock-owner', created_at: new Date().toISOString() } };
      }
      return await callEdgeFunction<{ class: unknown }>('create-class', { name, description });
    } finally {
      setLoading(false);
    }
  };

  const addClassMember = async (classId: string, studentEmail: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] addClassMember:', classId, studentEmail);
        return { ok: true };
      }
      return await callEdgeFunction<{ ok: boolean }>('add-class-member', { classId, studentEmail });
    } finally {
      setLoading(false);
    }
  };

  const removeClassMember = async (classId: string, studentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] removeClassMember:', classId, studentId);
        return { ok: true };
      }
      return await callEdgeFunction<{ ok: boolean }>('remove-class-member', { classId, studentId });
    } finally {
      setLoading(false);
    }
  };

  const inviteStudent = async (orgId: string, classId: string, email: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] inviteStudent:', orgId, classId, email);
        return { inviteId: `invite-${Date.now()}`, success: true };
      }
      return await callEdgeFunction<{ inviteId: string; success: boolean }>('invite-student', { orgId, classId, email });
    } finally {
      setLoading(false);
    }
  };

  const generateClassCode = async (classId: string, refreshCode?: boolean) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] generateClassCode:', classId, refreshCode);
        return { code: 'ABCD1234', expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
      }
      return await callEdgeFunction<{ code: string; expiresAt: string }>('generate-class-code', { classId, refreshCode });
    } finally {
      setLoading(false);
    }
  };

  const joinClass = async (code: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] joinClass:', code);
        return { success: true, classId: 'mock-class-id' };
      }
      return await callEdgeFunction<{ success: boolean; classId?: string }>('join-class', { code: code.toUpperCase() });
    } finally {
      setLoading(false);
    }
  };

  const createChildCode = async (studentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] createChildCode:', studentId);
        return { code: 'CHILD1234', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
      }
      return await callEdgeFunction<{ code: string; expiresAt: string }>('create-child-code', { studentId });
    } finally {
      setLoading(false);
    }
  };

  const linkChild = async (code: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] linkChild:', code);
        return { success: true, childId: 'mock-child-id' };
      }
      return await callEdgeFunction<{ success: boolean; childId?: string }>('link-child', { code });
    } finally {
      setLoading(false);
    }
  };

  // Messaging methods
  const sendMessage = async (recipientId: string, content: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] sendMessage:', recipientId, content);
        return { messageId: `msg-${Date.now()}`, success: true };
      }
      return await callEdgeFunction<{ messageId: string; success: boolean }>('send-message', { recipientId, content });
    } finally {
      setLoading(false);
    }
  };

  const listConversations = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listConversations');
        return { conversations: [] };
      }
      return await callEdgeFunctionGet<{ conversations: unknown[] }>('list-conversations');
    } finally {
      setLoading(false);
    }
  };

  const listMessages = async (conversationWith?: string, limit?: number) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listMessages:', conversationWith, limit);
        return { messages: [], nextCursor: null };
      }
      const params = new URLSearchParams();
      if (conversationWith) params.set('conversationWith', conversationWith);
      if (limit) params.set('limit', String(limit));
      return await callEdgeFunctionGet<{ messages: unknown[]; nextCursor: string | null }>(`list-messages?${params}`);
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
      if (useMockMode) {
        console.log('[MCP Mock] listMediaJobsFiltered:', params);
        return { ok: true, jobs: [] };
      }
      const queryParams = new URLSearchParams();
      if (params.courseId) queryParams.set('courseId', params.courseId);
      if (params.status) queryParams.set('status', params.status);
      if (params.limit) queryParams.set('limit', String(params.limit));
      return await callEdgeFunctionGet<{ ok: boolean; jobs: unknown[] }>(`list-media-jobs?${queryParams}`);
    } finally {
      setLoading(false);
    }
  };

  // Assignment Methods
  const listAssignmentsForTeacher = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listAssignmentsForTeacher');
        return { assignments: [], scope: 'teacher' as const };
      }
      return await callEdgeFunctionGet<{ assignments: unknown[]; scope: 'teacher' }>('list-assignments');
    } finally {
      setLoading(false);
    }
  };

  const listAssignmentsForStudent = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listAssignmentsForStudent');
        return { assignments: [], scope: 'student' as const };
      }
      return await callEdgeFunctionGet<{ assignments: unknown[]; scope: 'student' }>('list-assignments-student');
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
      if (useMockMode) {
        console.log('[MCP Mock] createAssignmentForCourse:', params);
        return { assignmentId: `assign-${Date.now()}`, message: 'Assignment created (mock)' };
      }
      return await callEdgeFunction<{ assignmentId: string; message: string }>('create-assignment', params);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentProgress = async (assignmentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getAssignmentProgress:', assignmentId);
        return { rows: [], assignmentTitle: 'Mock Assignment' };
      }
      return await callEdgeFunctionGet<{ rows: unknown[]; assignmentTitle: string }>(`get-assignment-progress?assignmentId=${assignmentId}`);
    } finally {
      setLoading(false);
    }
  };

  const exportGradebook = async (assignmentId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] exportGradebook:', assignmentId);
        return { url: 'mock-url', filename: 'gradebook.csv' };
      }
      return await callEdgeFunctionGet<{ url: string; filename: string }>(`export-gradebook?assignmentId=${assignmentId}`);
    } finally {
      setLoading(false);
    }
  };

  // Course Management Methods
  const getCourse = async (courseId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getCourse:', courseId);
        return { id: courseId, title: 'Mock Course', items: [] };
      }
      return await callEdgeFunctionGet<unknown>(`get-course?courseId=${courseId}`);
    } finally {
      setLoading(false);
    }
  };

  const getCourseCatalog = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getCourseCatalog');
        return { courses: [], subjects: [] };
      }
      return await callEdgeFunctionGet<unknown>('get-course-catalog');
    } finally {
      setLoading(false);
    }
  };

  const searchCourses = async (query: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] searchCourses:', query);
        return { courses: [] };
      }
      return await callEdgeFunctionGet<{ courses: unknown[] }>(`search-courses?query=${encodeURIComponent(query)}`);
    } finally {
      setLoading(false);
    }
  };

  const updateCourse = async (courseId: string, operations: unknown[]) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] updateCourse:', courseId, operations);
        return { ok: true, courseId };
      }
      return await callEdgeFunction<{ ok: boolean; courseId: string }>('update-course', { courseId, operations });
    } finally {
      setLoading(false);
    }
  };

  const publishCourse = async (courseId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] publishCourse:', courseId);
        return { ok: true, courseId };
      }
      return await callEdgeFunction<{ ok: boolean; courseId: string }>('publish-course', { courseId });
    } finally {
      setLoading(false);
    }
  };

  const restoreCourseVersion = async (courseId: string, version: number) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] restoreCourseVersion:', courseId, version);
        return { ok: true, courseId, version };
      }
      return await callEdgeFunction<{ ok: boolean; courseId: string; version: number }>('restore-course-version', { courseId, version });
    } finally {
      setLoading(false);
    }
  };

  const getCoursesByTags = async (tags: string[]) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getCoursesByTags:', tags);
        return { courses: [] };
      }
      return await callEdgeFunction<{ courses: unknown[] }>('get-courses-by-tags', { tags });
    } finally {
      setLoading(false);
    }
  };

  // Dashboard Methods
  const getDashboard = async (role: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getDashboard:', role);
        return { summary: {}, data: [] };
      }
      return await callEdgeFunctionGet<unknown>(`get-dashboard?role=${role}`);
    } finally {
      setLoading(false);
    }
  };

  const getClassProgress = async (classId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getClassProgress:', classId);
        return { students: [], summary: {} };
      }
      return await callEdgeFunctionGet<unknown>(`get-class-progress?classId=${classId}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async (courseId: string, range: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] fetchAnalytics:', courseId, range);
        return { dailyData: [], summary: {} };
      }
      return await callEdgeFunctionGet<unknown>(`get-analytics?courseId=${courseId}&range=${range}`);
    } finally {
      setLoading(false);
    }
  };

  const listOrgStudents = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] listOrgStudents');
        return { students: [] };
      }
      return await callEdgeFunctionGet<{ students: unknown[] }>('list-org-students');
    } finally {
      setLoading(false);
    }
  };

  // Game/Play Methods (legacy)
  const startRound = async (courseId: string, level: number) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] startRound:', courseId, level);
        return { sessionId: 'mock-session', roundId: 'mock-round' };
      }
      return await callEdgeFunction<{ sessionId: string; roundId: string }>('game-start-round', { courseId, level });
    } finally {
      setLoading(false);
    }
  };

  const logAttempt = async (params: unknown) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] logAttempt:', params);
        return { attemptId: 'mock-attempt' };
      }
      return await callEdgeFunction<{ attemptId: string }>('game-log-attempt', params as Record<string, unknown>);
    } finally {
      setLoading(false);
    }
  };

  // Org Config Methods
  const getOrgConfig = async () => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getOrgConfig');
        return { orgId: 'mock-org', settings: {} };
      }
      return await callEdgeFunctionGet<unknown>('get-org-config');
    } finally {
      setLoading(false);
    }
  };

  // Media Methods
  const uploadMediaFile = async (file: File, path: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] uploadMediaFile:', file.name, path);
        return { url: 'mock-url', path };
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);
      
      const { getAccessToken } = await import("@/lib/supabase");
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
      if (useMockMode) {
        console.log('[MCP Mock] rewriteText:', request.currentText.substring(0, 50), request.segmentType);
        return { candidates: [{ text: request.currentText, rationale: 'Mock rewrite' }], originalText: request.currentText, segmentType: request.segmentType, context: request.context };
      }
      return await callEdgeFunction<{ candidates: Array<{ text: string; rationale: string }>; originalText: string; segmentType: string; context: unknown }>('ai-rewrite-text', request);
    } finally {
      setLoading(false);
    }
  };

  // Job Status (for useJobStatus hook)
  const getJobStatus = async (jobId: string) => {
    setLoading(true);
    try {
      if (useMockMode) {
        console.log('[MCP Mock] getJobStatus:', jobId);
        return { jobId, state: 'running', step: 'generating', progress: 50 };
      }
      return await callEdgeFunctionGet<{ jobId: string; state: string; step: string; progress: number; message?: string }>(`job-status?jobId=${jobId}`);
    } finally {
      setLoading(false);
    }
  };

  return { 
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
    loading 
  };
}
