import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { JOB_MODES } from '@/lib/contracts';
import { callEdgeFunctionGet } from '@/lib/api/common';

// MCP Proxy settings (for local development only)
// Per IgniteZero rules: No fallback tokens - require explicit configuration
const MCP_BASE_URL = import.meta.env.VITE_MCP_BASE_URL || 'http://127.0.0.1:4000';
const MCP_TOKEN = import.meta.env.VITE_MCP_AUTH_TOKEN; // REQUIRED - no fallback

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
    } catch (error: any) {
      // Improve error messages for authentication issues
      if (error?.status === 401 || error?.code === 'UNAUTHORIZED' || error?.code === 'SESSION_STALE' || (error?.message || '').includes('401') || (error?.message || '').includes('Unauthorized')) {
        const errorMessage = error?.message || error?.details?.message || '';
        
        // Check for stale session / missing organization_id error
        if (errorMessage.includes('missing organization_id') || 
            errorMessage.includes('not configured') || 
            errorMessage.includes("doesn't include organization") ||
            errorMessage.includes('SESSION_STALE') ||
            error?.code === 'SESSION_STALE') {
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
    loading 
  };
}
